import { authenticate, handle, ok, readJson, type Params } from '@/lib/api/context'
import { fileDto } from '@/lib/api/serialize'
import { findFile, trashFile, updateFile, updateFileInput } from '@/lib/services/files'

/** GET /api/v1/files/:id */
export const GET = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('files:read')
  const file = await findFile(ctx.project.id, (await params).id, { includeTrashed: true })
  return ok({ file: fileDto(file) })
})

/** PATCH /api/v1/files/:id — renommer, déplacer, compléter la durée ou les dimensions. */
export const PATCH = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('files:update')
  const input = updateFileInput.parse(await readJson(request))
  const file = await updateFile(ctx.project, (await params).id, input, ctx.actor)
  return ok({ file: fileDto(file) })
})

/** DELETE /api/v1/files/:id — mise à la corbeille (CDS 21). */
export const DELETE = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('files:delete')
  const file = await trashFile(ctx.project, (await params).id, ctx.actor)
  return ok({ file: fileDto(file) })
})
