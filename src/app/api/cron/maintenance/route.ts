import { identify } from '@/lib/api/context'
import { ApiError, toErrorResponse } from '@/lib/api/errors'
import { env } from '@/lib/env'
import { safeEqual } from '@/lib/security/crypto'
import { runMaintenance } from '@/lib/services/maintenance'

/**
 * GET /api/cron/maintenance — passage de maintenance (corbeille, envois
 * abandonnés, relances de webhooks).
 *
 * Appelée chaque nuit par la tâche planifiée de Vercel, qui joint
 * `Authorization: Bearer <CRON_SECRET>`. Le super administrateur peut aussi
 * la lancer depuis la supervision.
 */
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    const header = request.headers.get('authorization') ?? ''
    const fromCron = Boolean(env.CRON_SECRET) && safeEqual(header, `Bearer ${env.CRON_SECRET}`)
    if (!fromCron) {
      const caller = await identify(request).catch(() => null)
      if (caller?.user?.role !== 'SUPER_ADMIN') throw new ApiError('unauthorized', 'Réservé à la tâche planifiée et au super administrateur.')
    }
    const report = await runMaintenance(fromCron ? 'cron' : 'manuel')
    return Response.json({ success: true, report })
  } catch (error) {
    return toErrorResponse(error)
  }
}
