import { z } from 'zod'

import { ApiError } from '@/lib/api/errors'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { audit, type Actor } from '@/lib/services/audit'
import { hashSecret, randomBase62 } from '@/lib/security/crypto'
import { API_KEY_PERMISSIONS, type Permission } from '@/lib/security/permissions'

/**
 * Clés API (CDS 6.4).
 *
 * La clé n'est montrée qu'une fois, à sa création ; la base n'en garde que
 * l'empreinte et un préfixe lisible. Une clé perdue se remplace, elle ne se
 * récupère pas.
 */
export const createKeyInput = z.object({
  name: z.string().trim().min(2, 'Nom trop court').max(60, 'Nom trop long'),
  permissions: z
    .array(z.enum(API_KEY_PERMISSIONS as [Permission, ...Permission[]]))
    .min(1, 'Choisissez au moins une permission'),
  /** Durée de validité en jours. Absente : la clé vaut jusqu'à révocation. */
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
})

export async function createApiKey(projectId: string, input: z.infer<typeof createKeyInput>, actor: Actor) {
  const mode = process.env.NODE_ENV === 'production' ? 'live' : 'test'
  const secret = `ks_${mode}_${randomBase62(40)}`
  const key = await prisma.apiKey.create({
    data: {
      projectId,
      name: input.name,
      prefix: secret.slice(0, 12),
      hash: hashSecret(secret, env.API_SECRET),
      permissions: [...new Set(input.permissions)],
      createdById: actor.userId ?? null,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
    },
  })
  await audit(actor, {
    action: 'CREATE_API_KEY',
    projectId,
    target: key.name,
    details: { prefix: key.prefix, permissions: key.permissions },
  })
  return { key, secret }
}

export async function revokeApiKey(projectId: string, keyId: string, actor: Actor) {
  const key = await prisma.apiKey.findFirst({ where: { id: keyId, projectId } })
  if (!key) throw new ApiError('not_found', 'Clé introuvable.')
  if (key.revokedAt) return key
  const updated = await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } })
  await audit(actor, { action: 'REVOKE_API_KEY', projectId, target: key.name, details: { prefix: key.prefix } })
  return updated
}
