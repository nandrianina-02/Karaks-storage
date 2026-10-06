import { authenticate, handle, type Params } from '@/lib/api/context'
import { findFile, serveFile } from '@/lib/services/files'

/** GET /api/v1/files/:id/download (CDS 14) */
async function download(request: Request, { params }: Params<{ id: string }>) {
  const ctx = await authenticate(request)
  ctx.require('download:read')
  const file = await findFile(ctx.project.id, (await params).id)
  return serveFile(request, ctx.project, file, { disposition: 'attachment', actor: ctx.actor })
}

export const GET = handle(download)
export const HEAD = handle(download)

/** Plafond des fonctions Vercel gratuites ; sans effet sur un serveur permanent. */
export const maxDuration = 60
