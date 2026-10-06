import { authenticate, handle, ok, type Params } from '@/lib/api/context'
import { deleteFilePermanently } from '@/lib/services/files'

/** DELETE /api/v1/files/:id/permanent — suppression définitive (CDS 21). */
export const DELETE = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('files:delete')
  await deleteFilePermanently(ctx.project, (await params).id, ctx.actor)
  return ok({})
})
