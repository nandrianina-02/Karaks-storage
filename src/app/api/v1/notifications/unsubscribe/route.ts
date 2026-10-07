import { unsubscribe, verifyUnsubscribe } from '@/lib/services/email-notifications'

/**
 * POST /api/v1/notifications/unsubscribe?u=…&c=…&s=… — désabonnement, sans
 * connexion : la signature de l'adresse en tient lieu.
 *
 * Deux appelants : la messagerie elle-même, pour le désabonnement en un clic
 * (RFC 8058, corps « List-Unsubscribe=One-Click »), et le formulaire de la
 * page /desabonnement, renvoyé ensuite sur cette page avec le résultat.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  const [userId, category, signature] = ['u', 'c', 's'].map((name) => url.searchParams.get(name) ?? '')
  const valid = verifyUnsubscribe(userId, category, signature)
  if (valid) await unsubscribe(userId, category)

  const body = await request.text().catch(() => '')
  if (body.includes('List-Unsubscribe=One-Click')) return new Response(null, { status: valid ? 200 : 400 })

  const back = new URL('/desabonnement', url)
  back.search = url.search
  back.searchParams.set('fait', valid ? '1' : '0')
  return Response.redirect(back, 303)
}
