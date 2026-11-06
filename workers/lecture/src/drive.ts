/**
 * Lecture d'un fichier Google Drive, par plages.
 *
 * Le jeton d'accès est gardé en mémoire de l'isolat : un lecteur réclame un
 * titre en dizaines de plages, sans cela chacune coûterait un appel à Google.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/drive/v3'

export interface IdentifiantsGoogle {
  clientId: string
  clientSecret: string
}

export class ErreurDrive extends Error {
  constructor(
    message: string,
    readonly statut: number,
  ) {
    super(message)
  }
}

const jetons = new Map<string, { valeur: string; jusqua: number }>()

/** Pour les tests : chaque cas part d'un isolat neuf. */
export function oublierJetons() {
  jetons.clear()
}

async function jetonAcces(
  fournisseur: string,
  rafraichissement: () => Promise<string>,
  google: IdentifiantsGoogle,
  recuperer: typeof fetch,
  forcer: boolean,
): Promise<string> {
  const garde = jetons.get(fournisseur)
  if (!forcer && garde && Date.now() < garde.jusqua - 60_000) return garde.valeur
  const reponse = await recuperer(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: google.clientId,
      client_secret: google.clientSecret,
      refresh_token: await rafraichissement(),
      grant_type: 'refresh_token',
    }),
  })
  const corps = (await reponse.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string }
  if (!reponse.ok || !corps.access_token) {
    // Accès retiré ou application Google restée en mode test : l'application
    // Next.js le signalera dans ses réglages ; ici, on ne peut que refuser.
    throw new ErreurDrive(`Google a refusé le renouvellement d'accès (${corps.error ?? reponse.status}).`, 503)
  }
  jetons.set(fournisseur, { valeur: corps.access_token, jusqua: Date.now() + (corps.expires_in ?? 3600) * 1000 })
  return corps.access_token
}

/**
 * Ouvre la lecture du fichier chez Drive. Un 401 déclenche un seul
 * renouvellement du jeton : il peut avoir été révoqué avant son expiration.
 */
export async function lireDrive(options: {
  fournisseur: string
  objet: string
  plage: { start: number; end: number } | null
  rafraichissement: () => Promise<string>
  google: IdentifiantsGoogle
  recuperer?: typeof fetch
}): Promise<Response> {
  const recuperer = options.recuperer ?? fetch
  for (let essai = 0; essai < 2; essai += 1) {
    const jeton = await jetonAcces(options.fournisseur, options.rafraichissement, options.google, recuperer, essai > 0)
    const entetes = new Headers({ Authorization: `Bearer ${jeton}` })
    if (options.plage) entetes.set('Range', `bytes=${options.plage.start}-${options.plage.end}`)
    const reponse = await recuperer(`${API}/files/${encodeURIComponent(options.objet)}?alt=media`, { headers: entetes })
    if (reponse.status === 401 && essai === 0) continue
    if (reponse.ok) return reponse
    if (reponse.status === 404) throw new ErreurDrive('Fichier absent du stockage.', 404)
    // 403 « userRateLimitExceeded », 5xx : passager, le lecteur réessaiera.
    throw new ErreurDrive(`Google Drive a répondu ${reponse.status}.`, 503)
  }
  throw new ErreurDrive('Google Drive refuse l’accès.', 503)
}
