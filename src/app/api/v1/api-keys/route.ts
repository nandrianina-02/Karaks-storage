import { authenticate, handle, ok, readJson } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { apiKeyDto } from '@/lib/api/serialize'
import { prisma } from '@/lib/prisma'
import { createApiKey, createKeyInput } from '@/lib/services/api-keys'

/** GET /api/v1/api-keys */
export const GET = handle(async (request: Request) => {
  const ctx = await authenticate(request)
  ctx.require('api-keys:manage')
  const keys = await prisma.apiKey.findMany({ where: { projectId: ctx.project.id }, orderBy: { createdAt: 'desc' } })
  return ok({ apiKeys: keys.map(apiKeyDto) })
})

/**
 * POST /api/v1/api-keys — la clé secrète n'est renvoyée qu'ici, une seule
 * fois (CDS 6.4).
 */
export const POST = handle(async (request: Request) => {
  const ctx = await authenticate(request)
  ctx.require('api-keys:manage')
  if (ctx.apiKey) throw new ApiError('forbidden', 'Une clé API ne peut pas créer d’autres clés.')
  const { key, secret } = await createApiKey(ctx.project.id, createKeyInput.parse(await readJson(request)), ctx.actor)
  return ok({ apiKey: apiKeyDto(key), secret }, { status: 201 })
})
