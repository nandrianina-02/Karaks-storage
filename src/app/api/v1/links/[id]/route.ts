import { authenticate, handle, ok, type Params } from '@/lib/api/context'
import { linkDto } from '@/lib/api/serialize'
import { revokeLink } from '@/lib/services/links'

/** DELETE /api/v1/links/:id — révocation immédiate (CDS 15). */
export const DELETE = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('links:revoke')
  const link = await revokeLink(ctx.project.id, (await params).id, ctx.actor)
  return ok({ link: linkDto(link) })
})
