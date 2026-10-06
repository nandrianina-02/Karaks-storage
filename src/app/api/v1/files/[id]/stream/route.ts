import { authenticate, handle, type Params } from '@/lib/api/context'
import { findFile, serveFile } from '@/lib/services/files'

/**
 * GET /api/v1/files/:id/stream (CDS 13)
 *
 * Diffusion authentifiée, avec requêtes de plage. Pour un lecteur dans un
 * navigateur ou sur Android, qui ne doit pas détenir de clé API, on demande
 * plutôt un lien temporaire (CDS 32).
 */
async function stream(request: Request, { params }: Params<{ id: string }>) {
  const ctx = await authenticate(request)
  ctx.require('stream:read')
  const file = await findFile(ctx.project.id, (await params).id)
  return serveFile(request, ctx.project, file, { disposition: 'inline', actor: ctx.actor })
}

export const GET = handle(stream)
export const HEAD = handle(stream)

/** Plafond des fonctions Vercel gratuites ; sans effet sur un serveur permanent. */
export const maxDuration = 60
