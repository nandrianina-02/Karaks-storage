import { parseRange } from '../../../src/lib/files/range'
import { ouvrirBase, type Base, type CleApi } from './base'
import { chiffrerLecture, dechiffrer, empreinte, lireLecture, type Lecture } from './chiffrement'
import { ErreurLecture, lireDrive } from './drive'
import { configS3, lireS3, type ConfigS3, type IdentifiantsS3 } from './s3'

/**
 * Worker de lecture de Karaks Storage.
 *
 * Pourquoi : chaque écoute fait passer tout le fichier par le serveur
 * (CDS 1 : jamais de lien Drive donné au client). Sur Vercel, ce transfert
 * est plafonné à 10 Go par mois dans l'offre gratuite, et son dépassement
 * désactive le déploiement : plus aucun titre ne se lit. Un Worker
 * Cloudflare ne facture pas le transfert ; il prend donc en charge la seule
 * partie lourde, la lecture, et renvoie tout le reste à l'application.
 *
 * - POST /api/v1/files/:id/signed-url : même contrat que l'application. Le
 *   lien rendu pointe vers ce Worker (/l/<jeton>) ; le jeton chiffré porte
 *   le fichier à servir, sans ligne en base.
 * - GET|HEAD /l/<jeton> : sert le fichier par plages, depuis Google Drive
 *   ou un stockage compatible S3.
 * - GET /api/v1/files/:id et GET /api/v1/folders (racine) : les lectures
 *   d'informations qu'un client fait avant d'afficher un fichier.
 * - tout le reste (téléversements, écritures, sous-dossiers, liens à usage
 *   compté, disque local de développement) est relayé tel quel à ORIGINE.
 */

export interface Env {
  /** Accès à Supabase par Cloudflare Hyperdrive : la voie à utiliser (voir docs/LECTURE_CLOUDFLARE.md). */
  HYPERDRIVE?: Hyperdrive
  /** Connexion directe, seulement sans Hyperdrive. */
  DATABASE_URL?: string
  API_SECRET: string
  ENCRYPTION_KEY: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  /** Ancien réglage unique de Drive, pour un fournisseur sans jeton en base. */
  GOOGLE_REFRESH_TOKEN?: string
  /** L'application Karaks Storage, qui garde tout ce qui n'est pas la lecture. */
  ORIGINE: string
}

export interface Dependances {
  base: (env: Env) => Base
  recuperer: typeof fetch
}

const API_KEY_PATTERN = /^ks_(live|test)_[0-9A-Za-z]{32,64}$/
const MIN_TTL = 30
const MAX_TTL = 7 * 24 * 60 * 60

function erreur(statut: number, code: string, message: string, entetes?: HeadersInit): Response {
  const h = new Headers(entetes)
  h.set('Cache-Control', 'no-store')
  return Response.json({ success: false, error: { code, message } }, { status: statut, headers: h })
}

/** Relais vers l'application : même méthode, mêmes en-têtes, même corps ; les redirections repartent telles quelles. */
function relayer(requete: Request, env: Env, recuperer: typeof fetch): Promise<Response> {
  const source = new URL(requete.url)
  const cible = new URL(source.pathname + source.search, env.ORIGINE)
  const sansCorps = requete.method === 'GET' || requete.method === 'HEAD'
  return recuperer(cible.toString(), { method: requete.method, headers: requete.headers, body: sansCorps ? null : requete.body, redirect: 'manual' })
}

function nomDispositif(telechargement: boolean, nom: string): string {
  const ascii = nom.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return `${telechargement ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom)}`
}

/**
 * La clé API de la requête, vérifiée comme `authenticate()` de l'application :
 * empreinte connue, ni révoquée ni expirée, projet désigné cohérent. Une
 * réponse d'erreur sinon.
 */
async function authentifier(requete: Request, env: Env, base: () => Base): Promise<CleApi | Response> {
  const cle = (requete.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!API_KEY_PATTERN.test(cle)) return erreur(401, 'unauthorized', 'Clé API invalide.')
  const k = await base().cleApi(await empreinte(cle, env.API_SECRET))
  if (!k || k.revoquee) return erreur(401, 'unauthorized', 'Clé API invalide ou révoquée.')
  if (k.expire !== null && k.expire <= Date.now()) return erreur(401, 'unauthorized', 'Clé API expirée.')
  const ref = requete.headers.get('x-project') ?? new URL(requete.url).searchParams.get('project')
  if (ref && ref !== k.projet.publicId) return erreur(403, 'forbidden', 'Cette clé n’est pas valable pour ce projet.')
  return k
}

function exiger(k: CleApi, ...requises: string[]): Response | null {
  const manquantes = requises.filter((p) => !k.permissions.includes(p))
  return manquantes.length ? erreur(403, 'forbidden', `Permission manquante : ${manquantes.join(', ')}.`) : null
}

/**
 * Lectures d'informations dont un client a besoin pour afficher un fichier
 * (Moziik : pochettes et images par /media). Servies ici pour qu'elles ne
 * dépendent pas de l'application ; toute écriture lui reste.
 */
async function infosFichier(requete: Request, env: Env, base: () => Base, publicId: string): Promise<Response> {
  const k = await authentifier(requete, env, base)
  if (k instanceof Response) return k
  const refus = exiger(k, 'files:read')
  if (refus) return refus
  const file = await base().infosFichier(k.projet.id, publicId)
  if (!file) return erreur(404, 'not_found', 'Fichier introuvable.')
  return Response.json({ success: true, file }, { headers: { 'Cache-Control': 'no-store' } })
}

async function dossiers(requete: Request, env: Env, base: () => Base): Promise<Response> {
  const k = await authentifier(requete, env, base)
  if (k instanceof Response) return k
  const refus = exiger(k, 'folders:read')
  if (refus) return refus
  const liste = await base().dossiersRacine(k.projet.id)
  return Response.json(
    { success: true, folders: liste.map((d) => ({ ...d, parentId: null, files: null, folders: null })), path: [] },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

async function signer(requete: Request, env: Env, deps: Dependances, base: () => Base, publicId: string): Promise<Response> {
  const copie = requete.clone()
  if (!API_KEY_PATTERN.test((requete.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''))) return erreur(401, 'unauthorized', 'Clé API invalide.')

  let corps: { type?: unknown; expiresIn?: unknown; maxUses?: unknown }
  try {
    corps = (await requete.json()) as typeof corps
  } catch {
    return erreur(400, 'bad_request', 'Corps de requête JSON attendu.')
  }
  // Un lien à usage compté a besoin de sa ligne en base : l'application s'en charge.
  if (corps.maxUses !== undefined && corps.maxUses !== null) return relayer(copie, env, deps.recuperer)
  const type = corps.type ?? 'stream'
  const duree = corps.expiresIn ?? 600
  if ((type !== 'stream' && type !== 'download') || typeof duree !== 'number' || !Number.isInteger(duree) || duree < MIN_TTL || duree > MAX_TTL) {
    return erreur(400, 'bad_request', `type « stream » ou « download », expiresIn entier de ${MIN_TTL} à ${MAX_TTL} secondes.`)
  }

  const k = await authentifier(requete, env, base)
  if (k instanceof Response) return k
  // Comme l'application : un lien de téléchargement exige déjà le droit de télécharger.
  const refus = exiger(k, 'links:create', type === 'download' ? 'download:read' : 'stream:read')
  if (refus) return refus

  const f = await base().fichier(k.projet.id, publicId)
  if (!f || !f.objet) return erreur(404, 'not_found', 'Fichier introuvable.')
  const fournisseur = await base().fournisseur(f.fournisseur)
  // Drive et S3 sont lus ici ; un autre fournisseur (disque local de développement) reste à l'application.
  const genre = fournisseur?.type === 'GOOGLE_DRIVE' ? 'drive' : fournisseur?.type === 'S3' && configS3(fournisseur.config) ? 's3' : null
  if (!genre) return relayer(copie, env, deps.recuperer)

  const expire = Date.now() + duree * 1000
  const lecture: Lecture = {
    fichier: f.id,
    fournisseur: f.fournisseur,
    genre,
    objet: f.objet,
    taille: f.taille,
    type: f.type,
    nom: f.nom,
    telechargement: type === 'download',
    origines: k.projet.origines,
    expire,
  }
  const url = `${new URL(requete.url).origin}/l/${await chiffrerLecture(lecture, env.ENCRYPTION_KEY)}`
  return Response.json({ success: true, url, expiresAt: new Date(expire).toISOString() }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Point d'accès et clés d'un fournisseur S3, gardés dix minutes en mémoire de
 * l'isolat : sans cela, chaque plage d'une même lecture relirait la base.
 */
const accesS3Garde = new Map<string, { valeur: { config: ConfigS3; identifiants: IdentifiantsS3 }; jusqua: number }>()

async function accesS3(fournisseur: string, env: Env, base: () => Base) {
  const garde = accesS3Garde.get(fournisseur)
  if (garde && garde.jusqua > Date.now()) return garde.valeur
  const f = await base().fournisseur(fournisseur)
  const config = configS3(f?.config)
  if (!f?.identifiants || !config) throw new ErreurLecture('Le stockage S3 n’est pas configuré.', 503)
  const valeur = { config, identifiants: JSON.parse(await dechiffrer(f.identifiants, env.ENCRYPTION_KEY)) as IdentifiantsS3 }
  accesS3Garde.set(fournisseur, { valeur, jusqua: Date.now() + 10 * 60_000 })
  return valeur
}

async function servir(requete: Request, env: Env, deps: Dependances, base: () => Base, ctx: ExecutionContext, jeton: string): Promise<Response> {
  const lecture = await lireLecture(jeton, env.ENCRYPTION_KEY)
  // Rien ne dit à quel fichier menait un lien refusé.
  if (!lecture) return erreur(404, 'not_found', 'Lien introuvable ou expiré.')

  const plage = parseRange(requete.headers.get('range'), lecture.taille)
  const entetes = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Type': lecture.type,
    'Content-Disposition': nomDispositif(lecture.telechargement, lecture.nom),
    // Un fichier peut être retiré à tout moment : aucun intermédiaire n'en garde de copie.
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    // Une balise <audio> d'un autre site doit pouvoir charger le titre.
    'Cross-Origin-Resource-Policy': 'cross-origin',
  })
  if (lecture.type === 'image/svg+xml') entetes.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
  const origine = requete.headers.get('origin')
  if (origine && lecture.origines.includes(origine)) {
    entetes.set('Access-Control-Allow-Origin', origine)
    entetes.set('Vary', 'Origin')
    entetes.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Disposition')
  }
  if (plage.kind === 'unsatisfiable') {
    entetes.set('Content-Range', `bytes */${lecture.taille}`)
    return new Response(null, { status: 416, headers: entetes })
  }
  const debut = plage.kind === 'partial' ? plage.start : 0
  const fin = plage.kind === 'partial' ? plage.end : lecture.taille - 1
  entetes.set('Content-Length', String(fin - debut + 1))
  if (plage.kind === 'partial') entetes.set('Content-Range', `bytes ${debut}-${fin}/${lecture.taille}`)
  const statut = plage.kind === 'partial' ? 206 : 200
  if (requete.method === 'HEAD') return new Response(null, { status: statut, headers: entetes })

  // L'ouverture d'une lecture (premier octet) vérifie que le fichier n'a pas
  // été retiré entre-temps, et compte l'écoute. Les plages suivantes de la
  // même lecture ne touchent pas la base.
  if (debut === 0) {
    if (!(await base().fichierActif(lecture.fichier))) return erreur(404, 'not_found', 'Lien introuvable ou expiré.')
    ctx.waitUntil(base().compterOuverture(lecture.fichier, lecture.telechargement).catch((e) => console.warn('compteur non mis à jour :', String(e))))
  }

  const morceau = plage.kind === 'partial' ? { start: debut, end: fin } : null
  try {
    const source =
      lecture.genre === 's3'
        ? await lireS3({ ...(await accesS3(lecture.fournisseur, env, base)), objet: lecture.objet, plage: morceau, recuperer: deps.recuperer })
        : await lireDrive({
            fournisseur: lecture.fournisseur,
            objet: lecture.objet,
            plage: morceau,
            google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
            recuperer: deps.recuperer,
            rafraichissement: async () => {
              const f = await base().fournisseur(lecture.fournisseur)
              const jetonGoogle = f?.identifiants ? await dechiffrer(f.identifiants, env.ENCRYPTION_KEY) : env.GOOGLE_REFRESH_TOKEN
              if (!jetonGoogle) throw new ErreurLecture('Google Drive n’est pas connecté.', 503)
              return jetonGoogle
            },
          })
    return new Response(source.body, { status: statut, headers: entetes })
  } catch (e) {
    if (e instanceof ErreurLecture) {
      console.warn('lecture refusée :', e.message)
      return erreur(e.statut, e.statut === 404 ? 'not_found' : 'storage_unavailable', e.statut === 404 ? 'Fichier absent du stockage.' : 'Le stockage est momentanément indisponible.', {
        'Retry-After': '5',
      })
    }
    throw e
  }
}

export function creerLecteur(deps: Dependances) {
  return {
    async fetch(requete: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      const url = new URL(requete.url)
      // La base n'est ouverte que si la requête en a besoin, et refermée après la réponse.
      let base: Base | null = null
      const ouvrir = () => (base ??= deps.base(env))
      try {
        if (url.pathname === '/sante') return Response.json({ ok: true })
        const lien = /^\/l\/([^/]+)$/.exec(url.pathname)
        if (lien && (requete.method === 'GET' || requete.method === 'HEAD')) return await servir(requete, env, deps, ouvrir, ctx, lien[1]!)
        const signe = /^\/api\/v1\/files\/([^/]+)\/signed-url$/.exec(url.pathname)
        if (signe && requete.method === 'POST') return await signer(requete, env, deps, ouvrir, decodeURIComponent(signe[1]!))
        const fichier = /^\/api\/v1\/files\/([^/]+)$/.exec(url.pathname)
        if (fichier && requete.method === 'GET') return await infosFichier(requete, env, ouvrir, decodeURIComponent(fichier[1]!))
        // Sous-dossiers et fil d'Ariane restent à l'application : seule la racine sert aux clients.
        if (url.pathname === '/api/v1/folders' && requete.method === 'GET' && !url.searchParams.get('parentId')) return await dossiers(requete, env, ouvrir)
        return await relayer(requete, env, deps.recuperer)
      } catch (e) {
        console.error('erreur du Worker de lecture :', e)
        return erreur(500, 'internal_error', 'Erreur interne. Réessayez dans un instant.')
      } finally {
        const b = base as Base | null
        if (b) ctx.waitUntil(b.fermer().catch(() => undefined))
      }
    },
  }
}

function baseDe(env: Env): Base {
  if (env.HYPERDRIVE) return ouvrirBase(env.HYPERDRIVE.connectionString, true)
  if (env.DATABASE_URL) return ouvrirBase(env.DATABASE_URL)
  throw new Error('Base non configurée : ni HYPERDRIVE ni DATABASE_URL.')
}

export default creerLecteur({ base: baseDe, recuperer: (entree, init) => fetch(entree, init) })
