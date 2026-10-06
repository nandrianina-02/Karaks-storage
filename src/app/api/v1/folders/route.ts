import { authenticate, handle, ok, readJson } from '@/lib/api/context'
import { folderDto } from '@/lib/api/serialize'
import { createFolder, createFolderInput, folderPath, listFolders } from '@/lib/services/folders'

/** GET /api/v1/folders?parentId=fld_… — sous-dossiers, et chemin depuis la racine. */
export const GET = handle(async (request: Request) => {
  const ctx = await authenticate(request)
  ctx.require('folders:read')
  const parentId = new URL(request.url).searchParams.get('parentId')
  const [folders, path] = await Promise.all([
    listFolders(ctx.project.id, parentId),
    folderPath(ctx.project.id, parentId),
  ])
  return ok({ folders: folders.map(folderDto), path })
})

/** POST /api/v1/folders — { "name": "audio", "parentId": null } */
export const POST = handle(async (request: Request) => {
  const ctx = await authenticate(request)
  ctx.require('folders:write')
  const folder = await createFolder(ctx.project, createFolderInput.parse(await readJson(request)), ctx.actor)
  return ok({ folder: folderDto(folder) }, { status: 201 })
})
