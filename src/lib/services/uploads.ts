import { z } from 'zod'

import type { UploadSession } from '@/generated/prisma/client'
import type { ProjectWithProvider } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { checkFileType, sanitizeFileName } from '@/lib/files/types'
import { newPublicId } from '@/lib/ids'
import { prisma } from '@/lib/prisma'
import type { Actor } from '@/lib/services/audit'
import { afterUpload, assertCanStore, storageNameFor, waveformInput } from '@/lib/services/files'
import { findFolder } from '@/lib/services/folders'
import { forgetQuota, withProvider } from '@/lib/storage'
import { CHUNK_GRANULARITY, type ResumableState } from '@/lib/storage/provider'

/**
 * Téléversement reprenable (CDS 12).
 *
 * Le client ouvre une session, puis envoie le fichier par morceaux avec
 * `Content-Range`. Après une coupure, il demande où en est la session et
 * reprend à cet octet. Côté fournisseur, la session Google Drive fait de
 * même : on lui relaie chaque morceau, et c'est elle qui fait foi sur le
 * nombre d'octets reçus.
 *
 * La signature réelle du fichier est contrôlée sur le premier morceau : un
 * contenu qui ne correspond pas à l'extension est refusé avant d'avoir
 * atteint le stockage (CDS 10).
 */
const SESSION_TTL_MS = 6 * 24 * 60 * 60 * 1000 // Drive garde ses sessions une semaine.

export const createUploadInput = z.object({
  name: z.string().trim().min(1).max(255),
  mimeType: z.string().max(120).optional().default(''),
  size: z.number().int().positive(),
  folderId: z.string().nullable().optional(),
  durationSeconds: z.number().min(0).max(86_400).optional(),
  width: z.number().int().min(1).max(100_000).optional(),
  height: z.number().int().min(1).max(100_000).optional(),
  waveform: waveformInput.optional(),
})

export async function createUpload(
  project: ProjectWithProvider,
  actor: Actor,
  input: z.infer<typeof createUploadInput>,
) {
  const name = sanitizeFileName(input.name)
  const type = checkFileType(name, input.mimeType)
  if (!type.ok) throw new ApiError('unsupported_media_type', type.reason)
  await assertCanStore(project, input.size)

  const folder = input.folderId ? await findFolder(project.id, input.folderId) : null
  const filePublicId = newPublicId('file')

  const providerSession = await withProvider(project.provider, (storage) =>
    storage.startResumable({
      name: storageNameFor(filePublicId, type.extension),
      mimeType: type.mimeType,
      parentId: folder?.providerFolderId ?? project.providerFolderId,
      size: input.size,
    }),
  )

  return prisma.uploadSession.create({
    data: {
      publicId: newPublicId('upload'),
      filePublicId,
      projectId: project.id,
      folderId: folder?.id ?? null,
      ownerId: actor.userId ?? null,
      apiKeyId: actor.apiKeyId ?? null,
      fileName: name,
      mimeType: type.mimeType,
      size: BigInt(input.size),
      durationSeconds: input.durationSeconds ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      waveform: input.waveform ?? [],
      providerSession,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  })
}

export async function findUpload(projectId: string, publicId: string) {
  const session = await prisma.uploadSession.findFirst({ where: { projectId, publicId } })
  if (!session) throw new ApiError('not_found', 'Session de téléversement introuvable.')
  if (session.status === 'ABORTED') throw new ApiError('gone', 'Session de téléversement annulée.')
  if (session.status === 'PENDING' && session.expiresAt <= new Date()) {
    throw new ApiError('gone', 'Session de téléversement expirée : recommencez l’envoi.')
  }
  return session
}

/** Crée le fichier quand le fournisseur annonce l'envoi complet. */
async function finalize(project: ProjectWithProvider, session: UploadSession, state: ResumableState, actor: Actor) {
  if (!state.object) throw new ApiError('internal_error', 'Le stockage n’a pas confirmé le fichier.')
  const extension = session.fileName.split('.').pop()!.toLowerCase()

  const file = await prisma.$transaction(async (tx) => {
    const created = await tx.file.create({
      data: {
        publicId: session.filePublicId,
        projectId: project.id,
        folderId: session.folderId,
        ownerId: session.ownerId,
        apiKeyId: session.apiKeyId,
        originalName: session.fileName,
        storageName: storageNameFor(session.filePublicId, extension),
        extension,
        mimeType: session.mimeType,
        size: BigInt(state.object!.size || Number(session.size)),
        checksum: state.object!.checksum ?? null,
        providerId: project.providerId,
        providerFileId: state.object!.id,
        status: 'ACTIVE',
        durationSeconds: session.durationSeconds,
        width: session.width,
        height: session.height,
        waveform: session.waveform,
      },
      include: { folder: { select: { publicId: true } } },
    })
    await tx.uploadSession.update({
      where: { id: session.id },
      data: { status: 'COMPLETED', received: session.size, fileId: created.id, providerSession: null },
    })
    return created
  })
  forgetQuota(project.provider.id)
  await afterUpload(project.id, actor, file)
  return file
}

export async function receiveChunk(
  project: ProjectWithProvider,
  publicId: string,
  range: { start: number; end: number; total: number },
  chunk: Uint8Array,
  actor: Actor,
) {
  const session = await findUpload(project.id, publicId)
  const total = Number(session.size)

  if (session.status === 'COMPLETED') {
    const file = await prisma.file.findUnique({ where: { id: session.fileId! }, include: { folder: { select: { publicId: true } } } })
    return { session, received: total, file }
  }
  if (range.total !== total) throw new ApiError('bad_request', 'La taille annoncée ne correspond pas à la session.')
  if (chunk.byteLength !== range.end - range.start + 1) {
    throw new ApiError('bad_request', 'Le morceau ne fait pas la taille annoncée par Content-Range.')
  }
  // Un morceau qui n'arrive pas à la suite du précédent est ignoré : le
  // client reçoit la position attendue et s'y recale (reprise, doublon).
  if (range.start !== Number(session.received)) {
    return { session, received: Number(session.received), file: null }
  }
  const isLast = range.end === total - 1
  if (!isLast && chunk.byteLength % CHUNK_GRANULARITY !== 0) {
    throw new ApiError('bad_request', `Chaque morceau, sauf le dernier, doit être un multiple de ${CHUNK_GRANULARITY} octets.`)
  }

  if (range.start === 0) {
    const type = checkFileType(session.fileName, session.mimeType, chunk.subarray(0, 4096))
    if (!type.ok) {
      await abortUpload(project, publicId)
      throw new ApiError('unsupported_media_type', type.reason)
    }
  }

  const state = await withProvider(project.provider, (storage) =>
    storage.uploadChunk(session.providerSession!, chunk, range.start, total),
  )

  if (state.done) {
    const file = await finalize(project, session, state, actor)
    return { session, received: total, file }
  }
  const updated = await prisma.uploadSession.update({
    where: { id: session.id },
    data: { received: BigInt(state.received) },
  })
  return { session: updated, received: state.received, file: null }
}

/** État réel d'une session, relu chez le fournisseur : c'est lui qui fait foi. */
export async function uploadStatus(project: ProjectWithProvider, publicId: string, actor: Actor) {
  const session = await findUpload(project.id, publicId)
  if (session.status === 'COMPLETED') {
    const file = await prisma.file.findUnique({ where: { id: session.fileId! }, include: { folder: { select: { publicId: true } } } })
    return { session, received: Number(session.size), file }
  }
  const state = await withProvider(project.provider, (storage) =>
    storage.queryResumable(session.providerSession!, Number(session.size)),
  )
  if (state.done) {
    const file = await finalize(project, session, state, actor)
    return { session, received: Number(session.size), file }
  }
  if (state.received !== Number(session.received)) {
    await prisma.uploadSession.update({ where: { id: session.id }, data: { received: BigInt(state.received) } })
  }
  return { session, received: state.received, file: null }
}

export async function abortUpload(project: ProjectWithProvider, publicId: string) {
  const session = await prisma.uploadSession.findFirst({ where: { projectId: project.id, publicId } })
  if (!session || session.status !== 'PENDING') return
  if (session.providerSession) {
    await withProvider(project.provider, (storage) => storage.abortResumable(session.providerSession!)).catch(() => undefined)
  }
  await prisma.uploadSession.update({
    where: { id: session.id },
    data: { status: 'ABORTED', providerSession: null },
  })
}

export function uploadDto(session: UploadSession, received: number) {
  return {
    id: session.publicId,
    fileId: session.filePublicId,
    name: session.fileName,
    mimeType: session.mimeType,
    size: Number(session.size),
    received,
    status: session.status.toLowerCase(),
    expiresAt: session.expiresAt.toISOString(),
  }
}
