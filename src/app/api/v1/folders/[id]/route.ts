import { z } from 'zod'

import { authenticate, handle, ok, readJson, type Params } from '@/lib/api/context'
import { folderDto } from '@/lib/api/serialize'
import { prisma } from '@/lib/prisma'
import { deleteFolder, findFolder, folderName, folderPath, renameFolder } from '@/lib/services/folders'

/** GET /api/v1/folders/:id */
export const GET = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('folders:read')
  const { id } = await params
  const found = await findFolder(ctx.project.id, id)
  const folder = await prisma.folder.findUniqueOrThrow({
    where: { id: found.id },
    include: {
      parent: { select: { publicId: true } },
      _count: { select: { files: { where: { status: 'ACTIVE' } }, children: true } },
    },
  })
  return ok({ folder: folderDto(folder), path: await folderPath(ctx.project.id, id) })
})

/** PATCH /api/v1/folders/:id — { "name": "covers" } */
export const PATCH = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('folders:write')
  const { name } = z.object({ name: folderName }).parse(await readJson(request))
  const folder = await renameFolder(ctx.project, (await params).id, name)
  return ok({ folder: folderDto(folder) })
})

/** DELETE /api/v1/folders/:id — dossier vide uniquement. */
export const DELETE = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('folders:write')
  await deleteFolder(ctx.project, (await params).id, ctx.actor)
  return ok({})
})
