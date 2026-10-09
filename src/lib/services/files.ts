import { z } from 'zod'

import type { File, Prisma } from '@/generated/prisma/client'
import type { ProjectWithProvider } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { env } from '@/lib/env'
import { parseRange } from '@/lib/files/range'
import { checkFileType, formatBytes, sanitizeFileName, type FileCategory } from '@/lib/files/types'
import { newPublicId } from '@/lib/ids'
import { prisma } from '@/lib/prisma'
import { checkProjectQuotaSoon } from '@/lib/services/alerts'
import { audit, type Actor } from '@/lib/services/audit'
import { findFolder } from '@/lib/services/folders'
import { recordUsage } from '@/lib/services/usage'
import { emit } from '@/lib/services/webhooks'
import { fileProvider, forgetQuota, providerQuota, s3Config, withProvider } from '@/lib/storage'
import type { S3Provider } from '@/lib/storage/s3'

/**
 * Fichiers (CDS 9, 11, 13, 14, 20, 21).
 */

// ---------------------------------------------------------------------------
// Recherche et pagination (CDS 20)
// ---------------------------------------------------------------------------

const MIME_BY_CATEGORY: Record<FileCategory, string> = {
  audio: 'audio/',
  image: 'image/',
  video: 'video/',
  document: '',
}

export const listQuery = z.object({
  search: z.string().trim().max(120).optional(),
  folderId: z.string().optional(),
  /** `root` : uniquement les fichiers hors dossier. */
  folder: z.enum(['root', 'all']).optional(),
  category: z.enum(['audio', 'image', 'video', 'document']).optional(),
  mimeType: z.string().max(80).optional(),
  status: z.enum(['active', 'trashed', 'all']).default('active'),
  minSize: z.coerce.number().int().min(0).optional(),
  maxSize: z.coerce.number().int().min(0).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['name', 'size', 'createdAt', 'updatedAt', 'type']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export type ListQuery = z.infer<typeof listQuery>

export async function listFiles(projectId: string, query: ListQuery) {
  const where: Prisma.FileWhereInput = { projectId }

  where.status =
    query.status === 'trashed' ? 'TRASHED' : query.status === 'all' ? { in: ['ACTIVE', 'TRASHED'] } : 'ACTIVE'

  if (query.folderId) {
    where.folderId = (await findFolder(projectId, query.folderId)).id
  } else if (query.folder === 'root') {
    where.folderId = null
  }
  if (query.search) where.originalName = { contains: query.search, mode: 'insensitive' }
  if (query.mimeType) where.mimeType = query.mimeType
  if (query.category) {
    const prefix = MIME_BY_CATEGORY[query.category]
    where.AND = prefix
      ? [{ mimeType: { startsWith: prefix } }]
      : [{ NOT: [{ mimeType: { startsWith: 'audio/' } }, { mimeType: { startsWith: 'image/' } }, { mimeType: { startsWith: 'video/' } }] }]
  }
  if (query.minSize !== undefined || query.maxSize !== undefined) {
    where.size = {
      gte: query.minSize === undefined ? undefined : BigInt(query.minSize),
      lte: query.maxSize === undefined ? undefined : BigInt(query.maxSize),
    }
  }
  if (query.from || query.to) where.createdAt = { gte: query.from, lte: query.to }

  const direction = query.order ?? (query.sort === 'name' || query.sort === 'type' ? 'asc' : 'desc')
  const orderBy: Prisma.FileOrderByWithRelationInput =
    query.sort === 'name'
      ? { originalName: direction }
      : query.sort === 'type'
        ? { mimeType: direction }
        : { [query.sort]: direction }

  const [items, total] = await Promise.all([
    prisma.file.findMany({
      where,
      include: { folder: { select: { publicId: true } } },
      orderBy: [orderBy, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.file.count({ where }),
  ])
  return { items, total, page: query.page, limit: query.limit, pages: Math.max(1, Math.ceil(total / query.limit)) }
}

export async function findFile(projectId: string, publicId: string, options: { includeTrashed?: boolean } = {}) {
  const file = await prisma.file.findFirst({
    where: {
      projectId,
      publicId,
      status: options.includeTrashed ? { in: ['ACTIVE', 'TRASHED'] } : 'ACTIVE',
    },
    include: { folder: { select: { publicId: true, name: true } } },
  })
  if (!file) throw new ApiError('not_found', 'Fichier introuvable.')
  return file
}

// ---------------------------------------------------------------------------
// Contrôles avant stockage (CDS 10, 24, 25)
// ---------------------------------------------------------------------------

export async function assertCanStore(project: ProjectWithProvider, size: number) {
  const limit = Math.min(Number(project.maxFileSize), env.STORAGE_MAX_FILE_SIZE)
  if (size > limit) {
    throw new ApiError('payload_too_large', `Fichier trop volumineux : ${formatBytes(limit)} au maximum.`)
  }
  if (size <= 0) throw new ApiError('bad_request', 'Le fichier est vide.')

  if (project.storageQuota !== null) {
    const used = await prisma.file.aggregate({
      where: { projectId: project.id, status: { in: ['ACTIVE', 'TRASHED'] } },
      _sum: { size: true },
    })
    if (Number(used._sum.size ?? 0) + size > Number(project.storageQuota)) {
      throw new ApiError('quota_exceeded', 'Le quota de stockage du projet est atteint.')
    }
  }

  // Le compte Google a sa propre limite (15 Go pour un compte gratuit), qui
  // couvre aussi Gmail et Photos : mieux vaut refuser proprement ici qu'au
  // milieu d'un envoi.
  const quota = await providerQuota(project.provider).catch(() => null)
  if (quota?.limit && quota.usage + size > quota.limit) {
    throw new ApiError('quota_exceeded', 'L’espace du stockage est plein.')
  }
}

export function storageNameFor(publicId: string, extension: string) {
  return `${publicId}.${extension}`
}

/** Crêtes du signal, de 0 à 100 ; 256 valeurs suffisent à tout affichage. */
export const waveformInput = z.array(z.number().int().min(0).max(100)).max(256)

const mediaInput = z.object({
  durationSeconds: z.coerce.number().min(0).max(86_400).optional(),
  width: z.coerce.number().int().min(1).max(100_000).optional(),
  height: z.coerce.number().int().min(1).max(100_000).optional(),
  waveform: waveformInput.optional(),
})

export const uploadFields = mediaInput.extend({
  folderId: z.string().optional().nullable(),
  name: z.string().trim().max(255).optional(),
})

/**
 * Téléversement en une fois (CDS 11). Destiné aux fichiers de taille
 * raisonnable ; au-delà, le client passe par une session reprenable (CDS 12).
 */
export async function uploadFile(
  project: ProjectWithProvider,
  actor: Actor,
  input: z.infer<typeof uploadFields> & { fileName: string; declaredMime: string; data: Uint8Array },
) {
  const name = sanitizeFileName(input.name || input.fileName)
  const type = checkFileType(name, input.declaredMime, input.data.subarray(0, 4096))
  if (!type.ok) throw new ApiError('unsupported_media_type', type.reason)
  await assertCanStore(project, input.data.byteLength)

  const folder = input.folderId ? await findFolder(project.id, input.folderId) : null
  const publicId = newPublicId('file')
  const storageName = storageNameFor(publicId, type.extension)

  const stored = await withProvider(project.provider, (storage) =>
    storage.upload({
      name: storageName,
      mimeType: type.mimeType,
      parentId: folder?.providerFolderId ?? project.providerFolderId,
      data: input.data,
    }),
  )
  forgetQuota(project.provider.id)

  const file = await prisma.file.create({
    data: {
      publicId,
      projectId: project.id,
      folderId: folder?.id ?? null,
      ownerId: actor.userId ?? null,
      apiKeyId: actor.apiKeyId ?? null,
      originalName: name,
      storageName,
      extension: type.extension,
      mimeType: type.mimeType,
      size: BigInt(input.data.byteLength),
      checksum: stored.checksum ?? null,
      providerId: project.providerId,
      providerFileId: stored.id,
      status: 'ACTIVE',
      durationSeconds: input.durationSeconds ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      waveform: input.waveform ?? [],
    },
    include: { folder: { select: { publicId: true } } },
  })
  await afterUpload(project.id, actor, file)
  return file
}

/** Effets communs à tout téléversement abouti, simple ou reprenable. */
export async function afterUpload(projectId: string, actor: Actor, file: File) {
  recordUsage(projectId, { uploads: 1, bytesIn: Number(file.size) })
  checkProjectQuotaSoon(projectId)
  await audit(actor, {
    action: 'UPLOAD',
    projectId,
    fileId: file.publicId,
    target: file.originalName,
    details: { size: Number(file.size), mimeType: file.mimeType },
  })
  emit(projectId, 'file.uploaded', {
    id: file.publicId,
    name: file.originalName,
    size: Number(file.size),
    mimeType: file.mimeType,
  })
}

// ---------------------------------------------------------------------------
// Modification, corbeille, suppression (CDS 6.2, 21)
// ---------------------------------------------------------------------------

export const updateFileInput = mediaInput.extend({
  name: z.string().trim().min(1).max(255).optional(),
  /** `null` : déplacer à la racine du projet. */
  folderId: z.string().nullable().optional(),
})

export async function updateFile(
  project: ProjectWithProvider,
  publicId: string,
  input: z.infer<typeof updateFileInput>,
  actor: Actor,
) {
  const file = await findFile(project.id, publicId)
  const data: Prisma.FileUpdateInput = {}

  if (input.name !== undefined) {
    const name = sanitizeFileName(input.name)
    // L'extension fixe le type servi : la changer par un renommage ferait
    // diffuser un fichier sous un type qui n'est pas le sien.
    const type = checkFileType(name, file.mimeType)
    if (!type.ok || type.extension !== file.extension) {
      throw new ApiError('bad_request', `Le nom doit garder l'extension .${file.extension}.`)
    }
    data.originalName = name
  }

  if (input.folderId !== undefined) {
    const target = input.folderId ? await findFolder(project.id, input.folderId) : null
    // Les dossiers sont ceux du fournisseur du projet : un fichier encore
    // chez l'ancien fournisseur, pendant une migration, n'y est pas déplacé.
    if ((target?.id ?? null) !== file.folderId && file.providerFileId && file.providerId === project.providerId) {
      const previous = file.folderId ? await prisma.folder.findUnique({ where: { id: file.folderId } }) : null
      await withProvider(project.provider, (storage) =>
        storage.update(file.providerFileId!, {
          parentId: target?.providerFolderId ?? project.providerFolderId ?? undefined,
          previousParentId: previous?.providerFolderId ?? project.providerFolderId ?? undefined,
        }),
      )
    }
    data.folder = target ? { connect: { id: target.id } } : { disconnect: true }
  }

  if (input.durationSeconds !== undefined) data.durationSeconds = input.durationSeconds
  if (input.width !== undefined) data.width = input.width
  if (input.height !== undefined) data.height = input.height
  if (input.waveform !== undefined) data.waveform = input.waveform

  const updated = await prisma.file.update({
    where: { id: file.id },
    data,
    include: { folder: { select: { publicId: true } } },
  })
  if (input.name !== undefined || input.folderId !== undefined) {
    await audit(actor, {
      action: 'UPDATE',
      projectId: project.id,
      fileId: file.publicId,
      target: updated.originalName,
      details: { renamed: input.name !== undefined, moved: input.folderId !== undefined },
    })
    emit(project.id, 'file.updated', { id: file.publicId, name: updated.originalName, folderId: updated.folder?.publicId ?? null })
  }
  return updated
}

/** Mise à la corbeille (CDS 21) : le fichier part dans le dossier `trash` du Drive. */
export async function trashFile(project: ProjectWithProvider, publicId: string, actor: Actor) {
  const file = await findFile(project.id, publicId)
  const trashFolder = project.provider.trashFolderId
  if (file.providerFileId && trashFolder && file.providerId === project.providerId) {
    const previous = file.folderId ? await prisma.folder.findUnique({ where: { id: file.folderId } }) : null
    await withProvider(project.provider, (storage) =>
      storage.update(file.providerFileId!, {
        parentId: trashFolder,
        previousParentId: previous?.providerFolderId ?? project.providerFolderId ?? undefined,
      }),
    )
  }
  const updated = await prisma.file.update({
    where: { id: file.id },
    data: { status: 'TRASHED', trashedAt: new Date() },
    include: { folder: { select: { publicId: true } } },
  })
  await audit(actor, { action: 'DELETE', projectId: project.id, fileId: file.publicId, target: file.originalName })
  emit(project.id, 'file.deleted', { id: file.publicId, name: file.originalName, permanent: false })
  return updated
}

export async function restoreFile(project: ProjectWithProvider, publicId: string, actor: Actor) {
  const file = await prisma.file.findFirst({
    where: { projectId: project.id, publicId, status: 'TRASHED' },
    include: { folder: true },
  })
  if (!file) throw new ApiError('not_found', 'Fichier introuvable dans la corbeille.')

  if (file.providerFileId && project.provider.trashFolderId && file.providerId === project.providerId) {
    await withProvider(project.provider, (storage) =>
      storage.update(file.providerFileId!, {
        parentId: file.folder?.providerFolderId ?? project.providerFolderId ?? undefined,
        previousParentId: project.provider.trashFolderId!,
      }),
    )
  }
  const updated = await prisma.file.update({
    where: { id: file.id },
    data: { status: 'ACTIVE', trashedAt: null },
    include: { folder: { select: { publicId: true } } },
  })
  await audit(actor, { action: 'RESTORE', projectId: project.id, fileId: file.publicId, target: file.originalName })
  emit(project.id, 'file.restored', { id: file.publicId, name: file.originalName })
  return updated
}

/**
 * Suppression définitive : opération distincte de la mise à la corbeille
 * (CDS 21). Les liens temporaires du fichier disparaissent avec lui.
 */
export async function deleteFilePermanently(project: ProjectWithProvider, publicId: string, actor: Actor) {
  const file = await findFile(project.id, publicId, { includeTrashed: true })
  const holder = await fileProvider(project, file)
  if (file.providerFileId) {
    await withProvider(holder, (storage) => storage.delete(file.providerFileId!))
  }
  forgetQuota(holder.id)
  await prisma.file.delete({ where: { id: file.id } })
  await audit(actor, {
    action: 'DELETE_PERMANENT',
    projectId: project.id,
    fileId: file.publicId,
    target: file.originalName,
    details: { size: Number(file.size) },
  })
  emit(project.id, 'file.deleted', { id: file.publicId, name: file.originalName, permanent: true })
}

// ---------------------------------------------------------------------------
// Diffusion (CDS 13, 14)
// ---------------------------------------------------------------------------

export interface ServeOptions {
  disposition: 'inline' | 'attachment'
  actor: Actor
  /** Origine autorisée à lire la réponse depuis un navigateur (CDS 26). */
  corsOrigin?: string | null
  /**
   * Ressource intégrable depuis n'importe quel site (lien temporaire). Le
   * jeton vaut autorisation ; la lecture par script reste soumise au CORS.
   */
  embeddable?: boolean
  /** Appelé au début d'une nouvelle lecture, pas à chaque plage. */
  onOpen?: () => Promise<void> | void
  /**
   * Diffusion directe (CDS V3) : si le fournisseur du fichier l'accepte, la
   * réponse redirige vers une adresse signée valable ce nombre de secondes,
   * et les octets ne passent plus par le serveur.
   */
  redirectFor?: number
}

function contentDisposition(kind: 'inline' | 'attachment', name: string) {
  // `filename` en ASCII pour les anciens clients, `filename*` pour le nom exact.
  const ascii = name.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'fichier'
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/**
 * Sert un fichier, entier ou par plage (CDS 13).
 *
 * Les octets passent par le serveur : les liens Google Drive ne doivent
 * jamais être donnés au client (CDS 1). Une lecture n'est comptée qu'au
 * premier octet — un lecteur émet des dizaines de requêtes de plage pour un
 * seul titre, et les compter toutes gonflerait les statistiques.
 */
export async function serveFile(
  request: Request,
  project: ProjectWithProvider,
  file: File,
  options: ServeOptions,
): Promise<Response> {
  const size = Number(file.size)
  const range = parseRange(request.headers.get('range'), size)
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Type': file.mimeType,
    'Content-Disposition': contentDisposition(options.disposition, file.originalName),
    // Un lien peut être révoqué à tout moment : aucun intermédiaire ne doit
    // garder de copie qui lui survivrait.
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    // Sans `cross-origin`, le navigateur refuse qu'une balise <audio> d'un
    // autre site charge un lien temporaire, même sans lecture par script.
    'Cross-Origin-Resource-Policy': options.embeddable || options.corsOrigin ? 'cross-origin' : 'same-origin',
  })
  if (file.checksum) headers.set('ETag', `"${file.checksum}"`)
  // Un SVG peut porter du script : ouvert directement, il ne doit rien
  // exécuter. Dans une balise <img>, cette politique ne change rien.
  if (file.mimeType === 'image/svg+xml') headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
  if (options.corsOrigin) {
    headers.set('Access-Control-Allow-Origin', options.corsOrigin)
    headers.set('Vary', 'Origin')
    headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Disposition, ETag')
  }

  if (range.kind === 'unsatisfiable') {
    headers.set('Content-Range', `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }

  const start = range.kind === 'partial' ? range.start : 0
  const end = range.kind === 'partial' ? range.end : size - 1
  headers.set('Content-Length', String(end - start + 1))
  if (range.kind === 'partial') headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
  const status = range.kind === 'partial' ? 206 : 200

  if (request.method === 'HEAD') return new Response(null, { status, headers })
  if (!file.providerFileId) throw new ApiError('not_found', 'Fichier absent du stockage.')

  const holder = await fileProvider(project, file)
  if (options.redirectFor && s3Config(holder)?.redirect) {
    const location = await withProvider(holder, (storage) =>
      (storage as S3Provider).presignedUrl(file.providerFileId!, {
        expiresIn: options.redirectFor!,
        fileName: file.originalName,
        contentType: file.mimeType,
        disposition: options.disposition,
      }),
    )
    await recordOpen(project, file, options)
    // Le lecteur lira tout le fichier chez le fournisseur : c'est la meilleure
    // estimation de la bande passante, qui ne passe plus par ici.
    recordUsage(project.id, { bytesOut: size })
    const redirect = new Headers({ Location: location, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' })
    for (const name of ['Cross-Origin-Resource-Policy', 'Access-Control-Allow-Origin', 'Vary']) {
      const value = headers.get(name)
      if (value) redirect.set(name, value)
    }
    return new Response(null, { status: 302, headers: redirect })
  }

  const source = await withProvider(holder, (storage) =>
    storage.createReadStream(file.providerFileId!, range.kind === 'partial' ? { start, end } : undefined),
  )

  if (start === 0) await recordOpen(project, file, options)

  return new Response(countBytes(source, (bytes) => recordUsage(project.id, { bytesOut: bytes })), { status, headers })
}

/** Une nouvelle lecture ou un téléchargement : compteurs, journal, webhook. */
async function recordOpen(project: ProjectWithProvider, file: File, options: ServeOptions) {
  const isDownload = options.disposition === 'attachment'
  await prisma.file.update({
    where: { id: file.id },
    data: {
      lastAccessAt: new Date(),
      ...(isDownload ? { downloadCount: { increment: 1 } } : { streamCount: { increment: 1 } }),
    },
  })
  recordUsage(project.id, isDownload ? { downloads: 1 } : { streams: 1 })
  await audit(options.actor, {
    action: isDownload ? 'DOWNLOAD' : 'STREAM',
    projectId: project.id,
    fileId: file.publicId,
    target: file.originalName,
  })
  emit(project.id, isDownload ? 'file.downloaded' : 'file.streamed', { id: file.publicId, name: file.originalName })
}

/**
 * Compte les octets réellement envoyés, y compris quand le lecteur
 * interrompt la lecture : c'est la bande passante consommée (CDS 22).
 */
function countBytes(source: ReadableStream<Uint8Array>, done: (bytes: number) => void): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  let sent = 0
  let reported = false
  const report = () => {
    if (reported) return
    reported = true
    done(sent)
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done: finished } = await reader.read()
        if (finished) {
          report()
          controller.close()
          return
        }
        sent += value.byteLength
        controller.enqueue(value)
      } catch (error) {
        report()
        controller.error(error)
      }
    },
    async cancel(reason) {
      report()
      await reader.cancel(reason).catch(() => undefined)
    },
  })
}
