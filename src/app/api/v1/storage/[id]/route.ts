import { handle, identify, ok, readJson, type Params } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { providerUpdateInput, removeProvider, updateProvider } from '@/lib/services/storage-admin'

async function superAdmin(request: Request) {
  const caller = await identify(request)
  if (caller.user?.role !== 'SUPER_ADMIN') throw new ApiError('forbidden', 'Réservé au super administrateur.')
  return caller
}

/** PATCH /api/v1/storage/:id — nom, fournisseur par défaut, diffusion directe. */
export const PATCH = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  await superAdmin(request)
  const provider = await updateProvider((await params).id, providerUpdateInput.parse(await readJson(request)))
  return ok({ provider: { id: provider.id, name: provider.name, isDefault: provider.isDefault } })
})

/** DELETE /api/v1/storage/:id — retire un stockage S3 qui ne porte plus rien. */
export const DELETE = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const caller = await superAdmin(request)
  await removeProvider((await params).id, caller.actor)
  return ok({})
})
