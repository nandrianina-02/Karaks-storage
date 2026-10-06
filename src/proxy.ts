import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Filtre d'entrée du tableau de bord.
 *
 * Il ne vérifie que la présence du cookie de session, sans interroger la
 * base : il s'exécute à chaque requête. La vraie vérification (session
 * valide, compte actif, droits sur le projet) reste faite côté serveur. Son
 * rôle est de rediriger avant tout rendu, avec un vrai 307.
 */
const PROTECTED = [
  '/dashboard',
  '/fichiers',
  '/dossiers',
  '/televersement',
  '/lectures',
  '/liens',
  '/cles-api',
  '/webhooks',
  '/statistiques',
  '/projets',
  '/journal',
  '/parametres',
  '/profil',
]

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next()
  }
  if (getSessionCookie(request, { cookiePrefix: 'karaks-storage' })) return NextResponse.next()

  const target = new URL('/connexion', request.url)
  target.searchParams.set('redirect', `${pathname}${search}`)
  return NextResponse.redirect(target)
}

export const config = {
  matcher: ['/((?!api|s/|_next|icon.svg|favicon.ico).*)'],
}
