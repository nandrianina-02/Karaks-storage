import { handle, identify, ok, readJson } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { connectS3, s3Input } from '@/lib/services/storage-admin'

/**
 * POST /api/v1/storage/s3 — relie un compartiment compatible S3 (R2, AWS S3,
 * B2…). Les clés sont vérifiées avant d'être enregistrées, chiffrées, et ne
 * sont plus jamais renvoyées.
 */
export const POST = handle(async (request: Request) => {
  const caller = await identify(request)
  if (caller.user?.role !== 'SUPER_ADMIN') throw new ApiError('forbidden', 'Réservé au super administrateur.')
  const provider = await connectS3(s3Input.parse(await readJson(request)), caller.actor)
  return ok({ provider: { id: provider.id, name: provider.name, kind: provider.kind, status: provider.status } }, { status: 201 })
})
