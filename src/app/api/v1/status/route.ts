import { rateLimit } from '@/lib/security/rate-limit'
import { clientIp } from '@/lib/services/audit'
import { publicStatus } from '@/lib/services/health'

/**
 * GET /api/v1/status — état public du service, sans authentification.
 *
 * Une application cliente peut l'interroger pour expliquer une panne à ses
 * utilisateurs plutôt que d'afficher une erreur générique. Réponse 200 tant
 * que le service répond, 503 si un composant est interrompu.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limit = await rateLimit(`status:${clientIp(request) ?? 'inconnu'}`, 60)
  if (!limit.allowed) {
    return Response.json(
      { success: false, error: { code: 'rate_limited', message: 'Trop de requêtes. Réessayez dans un instant.' } },
      { status: 429, headers: { 'Retry-After': String(limit.resetIn) } },
    )
  }
  const status = await publicStatus()
  return Response.json(
    { success: true, status: status.level, components: status.components, checkedAt: status.checkedAt },
    { status: status.level === 'down' ? 503 : 200, headers: { 'Cache-Control': 'public, max-age=15' } },
  )
}
