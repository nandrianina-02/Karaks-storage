import { z } from 'zod'

import type { File, SignedUrl } from '@/generated/prisma/client'
import type { ProjectWithProvider } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { linkStatus } from '@/lib/api/serialize'
import { appUrl, env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { audit, type Actor } from '@/lib/services/audit'
import { findFile } from '@/lib/services/files'
import { emit } from '@/lib/services/webhooks'
import { hashSecret, randomBase62 } from '@/lib/security/crypto'

/**
 * Liens temporaires (CDS 15).
 *
 * Le jeton figure dans l'adresse ; la base n'en garde que l'empreinte. Une
 * fuite de la base ne donne donc aucun lien utilisable. Le jeton fait 24
 * caractères en base 62, soit environ 143 bits : il ne se devine pas.
 */
export const TOKEN_LENGTH = 24
const MIN_TTL = 30
const MAX_TTL = 7 * 24 * 60 * 60

/**
 * Délai pendant lequel un lien à usage limité reste lisible par plages après
 * son ouverture comptée. Un lecteur audio réclame un titre en plusieurs
 * morceaux : sans ce délai, un lien à usage unique s'arrêterait au deuxième
 * morceau.
 */
export const PLAYBACK_GRACE_MS = 6 * 60 * 60 * 1000

export const createLinkInput = z.object({
  type: z.enum(['stream', 'download']).default('stream'),
  expiresIn: z.number().int().min(MIN_TTL).max(MAX_TTL).default(600),
  maxUses: z.number().int().min(1).max(100_000).nullable().optional(),
})

export function linkUrl(token: string) {
  return `${appUrl}/s/${token}`
}

export async function createLink(
  project: ProjectWithProvider,
  filePublicId: string,
  input: z.infer<typeof createLinkInput>,
  actor: Actor,
) {
  const file = await findFile(project.id, filePublicId)
  const token = randomBase62(TOKEN_LENGTH)
  const link = await prisma.signedUrl.create({
    data: {
      tokenHash: hashSecret(token, env.API_SECRET),
      hint: token.slice(0, 4),
      projectId: project.id,
      fileId: file.id,
      type: input.type === 'download' ? 'DOWNLOAD' : 'STREAM',
      expiresAt: new Date(Date.now() + input.expiresIn * 1000),
      maxUses: input.maxUses ?? null,
      createdById: actor.userId ?? null,
      apiKeyId: actor.apiKeyId ?? null,
    },
  })
  await audit(actor, {
    action: 'CREATE_LINK',
    projectId: project.id,
    fileId: file.publicId,
    target: file.originalName,
    details: { type: input.type, expiresIn: input.expiresIn, maxUses: input.maxUses ?? null },
  })
  emit(project.id, 'link.created', {
    id: link.id,
    fileId: file.publicId,
    type: input.type,
    expiresAt: link.expiresAt.toISOString(),
  })
  return { link, file, url: linkUrl(token) }
}

export async function revokeLink(projectId: string, linkId: string, actor: Actor) {
  const link = await prisma.signedUrl.findFirst({ where: { id: linkId, projectId }, include: { file: true } })
  if (!link) throw new ApiError('not_found', 'Lien introuvable.')
  if (link.revokedAt) return link
  const updated = await prisma.signedUrl.update({ where: { id: link.id }, data: { revokedAt: new Date() } })
  await audit(actor, {
    action: 'REVOKE_LINK',
    projectId,
    fileId: link.file.publicId,
    target: link.file.originalName,
  })
  return updated
}

export type LinkRefusal = { status: 404 | 410; message: string }

/**
 * Valide un jeton reçu sur `/s/<jeton>` et décide si la requête est servie.
 *
 * Un usage est compté à l'ouverture (requête qui commence au premier octet).
 * Les requêtes de plage suivantes sont admises tant que le lien a été ouvert
 * récemment, même si son quota d'usages est atteint : c'est la même lecture
 * qui continue.
 */
export async function consumeLink(
  token: string,
  rangeStart: number,
): Promise<{ link: SignedUrl & { file: File; project: ProjectWithProvider } } | { refusal: LinkRefusal }> {
  if (!/^[0-9A-Za-z]{16,64}$/.test(token)) return { refusal: { status: 404, message: 'Lien introuvable.' } }

  const link = await prisma.signedUrl.findUnique({
    where: { tokenHash: hashSecret(token, env.API_SECRET) },
    include: { file: true, project: { include: { provider: true } } },
  })
  if (!link || link.file.status !== 'ACTIVE') return { refusal: { status: 404, message: 'Lien introuvable.' } }

  const now = new Date()
  const status = linkStatus(link, now)
  if (status === 'revoked') return { refusal: { status: 410, message: 'Ce lien a été révoqué.' } }
  if (status === 'expired') {
    const first = await prisma.signedUrl.updateMany({
      where: { id: link.id, expiredNotifiedAt: null },
      data: { expiredNotifiedAt: now },
    })
    if (first.count === 1) {
      emit(link.projectId, 'link.expired', { id: link.id, fileId: link.file.publicId, expiredAt: link.expiresAt.toISOString() })
    }
    return { refusal: { status: 410, message: 'Ce lien a expiré.' } }
  }

  const opening = rangeStart === 0
  if (opening) {
    // Incrément conditionnel en une seule requête : deux ouvertures
    // simultanées d'un lien à usage unique ne peuvent pas passer toutes deux.
    const counted = await prisma.signedUrl.updateMany({
      where: {
        id: link.id,
        revokedAt: null,
        ...(link.maxUses !== null ? { uses: { lt: link.maxUses } } : {}),
      },
      data: { uses: { increment: 1 }, lastUsedAt: now },
    })
    if (counted.count === 0) {
      return { refusal: { status: 410, message: 'Ce lien a atteint son nombre d’utilisations.' } }
    }
  } else if (link.maxUses !== null) {
    const recentlyOpened = link.lastUsedAt && now.getTime() - link.lastUsedAt.getTime() < PLAYBACK_GRACE_MS
    if (link.uses === 0 || !recentlyOpened) {
      return { refusal: { status: 410, message: 'Ce lien a atteint son nombre d’utilisations.' } }
    }
  }

  return { link }
}

export const listLinksQuery = z.object({
  status: z.enum(['active', 'expired', 'revoked', 'exhausted', 'all']).default('all'),
  fileId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function listLinks(projectId: string, query: z.infer<typeof listLinksQuery>) {
  const now = new Date()
  const where = {
    projectId,
    ...(query.fileId ? { file: { publicId: query.fileId } } : {}),
    ...(query.status === 'revoked'
      ? { revokedAt: { not: null } }
      : query.status === 'expired'
        ? { revokedAt: null, expiresAt: { lte: now } }
        : query.status === 'active'
          ? { revokedAt: null, expiresAt: { gt: now } }
          : {}),
  }
  const [items, total] = await Promise.all([
    prisma.signedUrl.findMany({
      where,
      include: { file: { select: { publicId: true, originalName: true, mimeType: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.signedUrl.count({ where }),
  ])
  // « Épuisé » dépend de deux colonnes : filtré après lecture.
  const filtered =
    query.status === 'active' || query.status === 'exhausted'
      ? items.filter((link) => linkStatus(link, now) === query.status)
      : items
  return { items: filtered, total, page: query.page, limit: query.limit }
}
