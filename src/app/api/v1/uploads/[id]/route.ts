import { authenticate, handle, ok, type Params } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { fileDto } from '@/lib/api/serialize'
import { parseContentRange } from '@/lib/files/range'
import { abortUpload, receiveChunk, uploadDto, uploadStatus } from '@/lib/services/uploads'
import { CHUNK_SIZE } from '@/lib/storage/provider'

/** GET /api/v1/uploads/:id — octets déjà reçus : c'est de là que le client reprend. */
export const GET = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('files:upload')
  const { session, received, file } = await uploadStatus(ctx.project, (await params).id, ctx.actor)
  return ok({ upload: uploadDto(session, received), file: file ? fileDto(file) : null })
})

/**
 * PUT /api/v1/uploads/:id — un morceau, avec `Content-Range`.
 *
 * Réponse 200 avec `file` quand l'envoi est complet ; 202 avec `received`
 * sinon. Si `received` diffère de la fin du morceau envoyé, le client se
 * recale sur cette valeur.
 */
export const PUT = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('files:upload')
  const range = parseContentRange(request.headers.get('content-range'))
  if (!range) throw new ApiError('bad_request', 'En-tête Content-Range attendu : bytes <début>-<fin>/<total>.')
  if (range.end - range.start + 1 > CHUNK_SIZE) {
    throw new ApiError('payload_too_large', `Morceau trop grand : ${CHUNK_SIZE} octets au maximum.`)
  }

  const chunk = new Uint8Array(await request.arrayBuffer())
  const { session, received, file } = await receiveChunk(ctx.project, (await params).id, range, chunk, ctx.actor)
  return ok(
    { upload: uploadDto(session, received), file: file ? fileDto(file) : null },
    { status: file ? 200 : 202 },
  )
})

/** DELETE /api/v1/uploads/:id — abandon de l'envoi. */
export const DELETE = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('files:upload')
  await abortUpload(ctx.project, (await params).id)
  return ok({})
})

/** Plafond des fonctions Vercel gratuites ; sans effet sur un serveur permanent. */
export const maxDuration = 60
