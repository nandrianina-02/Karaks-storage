import { after } from 'next/server'

import { ApiError, toErrorResponse } from '@/lib/api/errors'
import { fileDto } from '@/lib/api/serialize'
import { drainBackground, isServerless } from '@/lib/background'
import { parseContentRange } from '@/lib/files/range'
import { clientIp } from '@/lib/services/audit'
import { findUploadByToken, receiveChunk, uploadDto, uploadStatus } from '@/lib/services/uploads'
import { rateLimit } from '@/lib/security/rate-limit'
import { CHUNK_SIZE } from '@/lib/storage/provider'

/**
 * Envoi direct depuis un navigateur : /u/:id?t=<jeton>.
 *
 * Le serveur d'une application (Karaks) ouvre la session avec sa clé API et
 * remet cette adresse au navigateur, qui y envoie les morceaux lui-même. La
 * clé ne quitte jamais le serveur, et le fichier ne transite pas deux fois.
 * C'est l'équivalent des adresses d'envoi signées de S3.
 *
 * CORS : seules les origines déclarées dans le projet peuvent envoyer.
 */
type Context = { params: Promise<{ id: string }> }

export const maxDuration = 60

function cors(request: Request, origins: string[]): Record<string, string> {
  const origin = request.headers.get('origin')
  if (!origin || !origins.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Expose-Headers': 'Content-Type',
  }
}

async function load(request: Request, { params }: Context) {
  const { id } = await params
  const token = new URL(request.url).searchParams.get('t') ?? ''
  const limit = await rateLimit(`upload-link:${clientIp(request) ?? 'inconnu'}`, 600)
  if (!limit.allowed) {
    throw new ApiError('rate_limited', 'Trop de requêtes. Réessayez dans un instant.', undefined, {
      'Retry-After': String(limit.resetIn),
    })
  }
  const session = await findUploadByToken(id, token)
  const actor = {
    userId: session.ownerId,
    apiKeyId: session.apiKeyId,
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  }
  return { session, project: session.project, actor }
}

function withCors(response: Response, headers: Record<string, string>) {
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
  return response
}

/** Octets déjà reçus : c'est de là que le navigateur reprend après une coupure. */
export async function GET(request: Request, context: Context) {
  if (isServerless) after(drainBackground)
  let headers: Record<string, string> = {}
  try {
    const { project, actor } = await load(request, context)
    headers = cors(request, project.allowedOrigins)
    const { session, received, file } = await uploadStatus(project, (await context.params).id, actor)
    return withCors(Response.json({ success: true, upload: uploadDto(session, received), file: file ? fileDto(file) : null }), headers)
  } catch (error) {
    return withCors(toErrorResponse(error), headers)
  }
}

/** Un morceau, avec Content-Range. 200 et le fichier à la fin, 202 sinon. */
export async function PUT(request: Request, context: Context) {
  if (isServerless) after(drainBackground)
  let headers: Record<string, string> = {}
  try {
    const { project, actor } = await load(request, context)
    headers = cors(request, project.allowedOrigins)
    const range = parseContentRange(request.headers.get('content-range'))
    if (!range) throw new ApiError('bad_request', 'En-tête Content-Range attendu : bytes <début>-<fin>/<total>.')
    if (range.end - range.start + 1 > CHUNK_SIZE) {
      throw new ApiError('payload_too_large', `Morceau trop grand : ${CHUNK_SIZE} octets au maximum.`)
    }
    const chunk = new Uint8Array(await request.arrayBuffer())
    const { session, received, file } = await receiveChunk(project, (await context.params).id, range, chunk, actor)
    return withCors(
      Response.json(
        { success: true, upload: uploadDto(session, received), file: file ? fileDto(file) : null },
        { status: file ? 200 : 202 },
      ),
      headers,
    )
  } catch (error) {
    return withCors(toErrorResponse(error), headers)
  }
}

/**
 * Prévol CORS : Content-Range n'est pas un en-tête « simple ». L'origine
 * n'est vérifiée qu'à la vraie requête, qui connaît le projet.
 */
export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  return new Response(null, {
    status: 204,
    headers: {
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Range, Content-Type',
      'Access-Control-Max-Age': '600',
    },
  })
}
