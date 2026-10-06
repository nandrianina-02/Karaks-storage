import { authenticate, handle, ok, type Params } from '@/lib/api/context'
import { sendTestEvent } from '@/lib/services/webhook-admin'

/** POST /api/v1/webhooks/:id/test — envoi d'essai signé. */
export const POST = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request)
  ctx.require('webhooks:manage')
  const result = await sendTestEvent(ctx.project.id, (await params).id)
  return ok({ delivery: result })
})
