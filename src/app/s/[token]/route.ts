import { after } from 'next/server'

import { toErrorResponse } from '@/lib/api/errors'
import { drainBackground, isServerless } from '@/lib/background'
import { clientIp } from '@/lib/services/audit'
import { serveFile } from '@/lib/services/files'
import { consumeLink } from '@/lib/services/links'
import { parseRange } from '@/lib/files/range'
import { rateLimit } from '@/lib/security/rate-limit'

/**
 * GET /s/:jeton — lien temporaire public (CDS 15, 26).
 *
 * Pas d'authentification : le jeton en tient lieu. Il ne doit donc rien
 * révéler quand il échoue — un lien inconnu, révoqué ou expiré renvoie une
 * page sobre, sans dire à quel fichier il menait.
 *
 * CORS : seules les origines déclarées dans le projet peuvent lire la
 * réponse depuis un script. Une balise <audio> sans `crossorigin` lit le
 * fichier quelle que soit l'origine ; c'est l'analyse du signal (vumètre de
 * Karaks) et le mode hors connexion, qui lisent par script, qui en ont besoin.
 */
type Context = { params: Promise<{ token: string }> }

function allowedOrigin(request: Request, origins: string[]): string | null {
  const origin = request.headers.get('origin')
  return origin && origins.includes(origin) ? origin : null
}

function refusal(status: number, message: string, request: Request) {
  if (request.headers.get('accept')?.includes('text/html')) {
    return new Response(
      `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>Lien indisponible</title><body style="font-family:system-ui,sans-serif;background:#0b1120;color:#e6eaf2;display:grid;place-items:center;min-height:100vh;margin:0">` +
        `<main style="max-width:28rem;padding:1.5rem"><p style="font-size:.75rem;letter-spacing:.2em;color:#8a94a7">KARAKS STORAGE</p>` +
        `<h1 style="font-size:1.25rem;margin:.5rem 0">Lien indisponible</h1><p style="color:#a3acbd;line-height:1.5">${message}</p></main></body></html>`,
      { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
    )
  }
  return Response.json(
    { success: false, error: { code: status === 410 ? 'gone' : 'not_found', message } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}

/** Une lecture longue sur une connexion lente : plafond des fonctions Vercel gratuites. */
export const maxDuration = 60

async function serve(request: Request, { params }: Context) {
  if (isServerless) after(drainBackground)
  try {
    const { token } = await params
    // Freine l'essai de jetons au hasard sans gêner un lecteur, qui émet
    // quelques dizaines de requêtes de plage par minute au plus.
    const limit = await rateLimit(`link:${clientIp(request) ?? 'inconnu'}`, 600)
    if (!limit.allowed) return refusal(429, 'Trop de requêtes. Réessayez dans un instant.', request)

    const head = parseRange(request.headers.get('range'), Number.MAX_SAFE_INTEGER)
    const start = head.kind === 'partial' ? head.start : 0
    // Une requête HEAD n'ouvre pas de lecture : elle ne consomme pas d'usage.
    const result = await consumeLink(token, request.method === 'HEAD' ? 1 : start)
    if ('refusal' in result) return refusal(result.refusal.status, result.refusal.message, request)

    const { link } = result
    return await serveFile(request, link.project, link.file, {
      disposition: link.type === 'DOWNLOAD' ? 'attachment' : 'inline',
      actor: {
        apiKeyId: link.apiKeyId,
        ip: clientIp(request),
        userAgent: request.headers.get('user-agent'),
      },
      corsOrigin: allowedOrigin(request, link.project.allowedOrigins),
      embeddable: true,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export const GET = serve
export const HEAD = serve

/** Prévol CORS : l'en-tête `Range` envoyé par un script le déclenche. */
export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  // L'origine n'est vérifiée qu'à la vraie requête, qui connaît le projet :
  // le prévol se contente d'annoncer les méthodes et en-têtes admis.
  return new Response(null, {
    status: 204,
    headers: {
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Max-Age': '600',
    },
  })
}
