import { handle, identify, ok } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { markNotificationsSeen, notificationsFor } from '@/lib/services/notifications'

async function user(request: Request) {
  const caller = await identify(request)
  if (!caller.user) throw new ApiError('forbidden', 'Réservé aux comptes du tableau de bord.')
  return caller.user
}

/** GET /api/v1/me/notifications */
export const GET = handle(async (request: Request) => {
  return ok(await notificationsFor((await user(request)).id))
})

/** POST /api/v1/me/notifications — tout marquer comme lu. */
export const POST = handle(async (request: Request) => {
  await markNotificationsSeen((await user(request)).id)
  return ok({})
})
