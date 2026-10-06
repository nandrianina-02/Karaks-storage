import { authenticate, handle, ok, readJson, type Params } from '@/lib/api/context'
import { webhookDto } from '@/lib/api/serialize'
import { prisma } from '@/lib/prisma'
import { deleteWebhook, findWebhook, updateWebhookInput } from '@/lib/services/webhook-admin'

/** GET /api/v1/webhooks/:id — avec les 20 derniers envois. */
export const GET = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('webhooks:manage')
  const hook = await findWebhook(ctx.project.id, (await params).id)
  const deliveries = await prisma.webhookDelivery.findMany({
    where: { webhookId: hook.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  return ok({
    webhook: webhookDto({ ...hook, deliveries }),
    deliveries: deliveries.map((delivery) => ({
      id: delivery.id,
      event: delivery.event,
      success: delivery.success,
      statusCode: delivery.statusCode,
      error: delivery.error,
      durationMs: delivery.durationMs,
      createdAt: delivery.createdAt.toISOString(),
    })),
  })
})

/** PATCH /api/v1/webhooks/:id — adresse, événements, activation. */
export const PATCH = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('webhooks:manage')
  const hook = await findWebhook(ctx.project.id, (await params).id)
  const input = updateWebhookInput.parse(await readJson(request))
  const updated = await prisma.webhook.update({ where: { id: hook.id }, data: input })
  return ok({ webhook: webhookDto(updated) })
})

/** DELETE /api/v1/webhooks/:id */
export const DELETE = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('webhooks:manage')
  await deleteWebhook(ctx.project.id, (await params).id, ctx.actor)
  return ok({})
})
