import { authenticate, handle, ok, readJson } from '@/lib/api/context'
import { webhookDto } from '@/lib/api/serialize'
import { prisma } from '@/lib/prisma'
import { createWebhook, createWebhookInput } from '@/lib/services/webhook-admin'

/** GET /api/v1/webhooks */
export const GET = handle(async (request: Request) => {
  const ctx = await authenticate(request)
  ctx.require('webhooks:manage')
  const hooks = await prisma.webhook.findMany({
    where: { projectId: ctx.project.id },
    include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { createdAt: 'desc' },
  })
  return ok({ webhooks: hooks.map(webhookDto) })
})

/**
 * POST /api/v1/webhooks — { "url": "https://…", "events": ["file.uploaded"] }
 *
 * Le secret de signature n'est renvoyé qu'à la création.
 */
export const POST = handle(async (request: Request) => {
  const ctx = await authenticate(request)
  ctx.require('webhooks:manage')
  const { hook, secret } = await createWebhook(ctx.project.id, createWebhookInput.parse(await readJson(request)), ctx.actor)
  return ok({ webhook: webhookDto(hook), secret }, { status: 201 })
})
