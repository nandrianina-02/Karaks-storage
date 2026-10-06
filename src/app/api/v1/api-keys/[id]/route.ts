import { authenticate, handle, ok, type Params } from '@/lib/api/context'
import { apiKeyDto } from '@/lib/api/serialize'
import { revokeApiKey } from '@/lib/services/api-keys'

/** DELETE /api/v1/api-keys/:id — révocation, effective à la requête suivante. */
export const DELETE = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('api-keys:manage')
  const key = await revokeApiKey(ctx.project.id, (await params).id, ctx.actor)
  return ok({ apiKey: apiKeyDto(key) })
})
