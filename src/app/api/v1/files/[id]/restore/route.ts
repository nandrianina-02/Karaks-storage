import { authenticate, handle, ok, type Params } from '@/lib/api/context'
import { fileDto } from '@/lib/api/serialize'
import { restoreFile } from '@/lib/services/files'

/** POST /api/v1/files/:id/restore (CDS 21) */
export const POST = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('files:delete')
  const file = await restoreFile(ctx.project, (await params).id, ctx.actor)
  return ok({ file: fileDto(file) })
})
