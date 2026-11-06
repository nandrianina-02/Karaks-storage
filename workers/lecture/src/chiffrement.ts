/**
 * Cryptographie du Worker de lecture, en WebCrypto (pas de node:crypto).
 *
 * Deux usages :
 * - relire ce que l'application Next.js a écrit en base (empreinte HMAC des
 *   clés API, jeton Google chiffré en AES-256-GCM) : les formats doivent être
 *   identiques à ceux de `src/lib/security/crypto.ts` ;
 * - fabriquer les jetons de lecture du Worker, qui portent eux-mêmes ce qu'il
 *   faut pour servir le fichier. Ils sont chiffrés, pas seulement signés :
 *   l'identifiant Drive qu'ils contiennent ne doit jamais être lisible par le
 *   client (CDS 8, 24).
 */

const encodeur = new TextEncoder()
const decodeur = new TextDecoder()

export function versBase64url(octets: Uint8Array): string {
  let binaire = ''
  for (const o of octets) binaire += String.fromCharCode(o)
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function depuisBase64url(texte: string): Uint8Array {
  const b64 = texte.replace(/-/g, '+').replace(/_/g, '/')
  const binaire = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(binaire, (c) => c.charCodeAt(0))
}

const enHex = (octets: ArrayBuffer) => [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('')

/** Même empreinte que `hashSecret` : HMAC-SHA-256 du secret, poivré par API_SECRET. */
export async function empreinte(secret: string, poivre: string): Promise<string> {
  const cle = await crypto.subtle.importKey('raw', encodeur.encode(poivre), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return enHex(await crypto.subtle.sign('HMAC', cle, encodeur.encode(secret)))
}

/** Clé AES dérivée comme `deriveKey` : SHA-256 de « <étiquette>:<secret> ». */
async function cleAes(secret: string, etiquette: string): Promise<CryptoKey> {
  const brute = await crypto.subtle.digest('SHA-256', encodeur.encode(`${etiquette}:${secret}`))
  return crypto.subtle.importKey('raw', brute, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/**
 * Relit une valeur chiffrée par l'application : `v1.<iv>.<tag>.<données>`.
 * WebCrypto attend l'étiquette d'authentification collée au texte chiffré.
 */
export async function dechiffrer(valeur: string, secret: string): Promise<string> {
  const [version, iv, tag, donnees] = valeur.split('.')
  if (version !== 'v1' || !iv || !tag || donnees === undefined) throw new Error('Valeur chiffrée illisible.')
  const chiffre = depuisBase64url(donnees)
  const etiquette = depuisBase64url(tag)
  const tout = new Uint8Array(chiffre.length + etiquette.length)
  tout.set(chiffre)
  tout.set(etiquette, chiffre.length)
  const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: depuisBase64url(iv) }, await cleAes(secret, 'karaks-storage'), tout)
  return decodeur.decode(clair)
}

/** Ce qu'un jeton de lecture sait du fichier à servir. */
export interface Lecture {
  /** Identifiant interne du fichier (base), pour les compteurs. */
  fichier: string
  /** Fournisseur qui détient le fichier, son type, et l'identifiant chez lui. */
  fournisseur: string
  genre: 'drive' | 's3'
  objet: string
  taille: number
  type: string
  nom: string
  telechargement: boolean
  /** Origines autorisées à lire la réponse depuis un script (projet). */
  origines: string[]
  /** Fin de validité, en millisecondes. */
  expire: number
}

/**
 * Jeton de lecture : AES-GCM sur le JSON de la lecture. La clé est dérivée
 * d'ENCRYPTION_KEY avec une étiquette propre : un jeton ne peut pas être
 * confondu avec une valeur chiffrée de la base, ni l'inverse.
 */
export async function chiffrerLecture(lecture: Lecture, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cleAes(secret, 'karaks-lecture'), encodeur.encode(JSON.stringify(lecture)))
  const tout = new Uint8Array(12 + chiffre.byteLength)
  tout.set(iv)
  tout.set(new Uint8Array(chiffre), 12)
  return versBase64url(tout)
}

/** null pour un jeton altéré, fabriqué ailleurs ou expiré. */
export async function lireLecture(jeton: string, secret: string, maintenant = Date.now()): Promise<Lecture | null> {
  if (!/^[0-9A-Za-z_-]{40,4000}$/.test(jeton)) return null
  try {
    const tout = depuisBase64url(jeton)
    const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: tout.slice(0, 12) }, await cleAes(secret, 'karaks-lecture'), tout.slice(12))
    const lecture = JSON.parse(decodeur.decode(clair)) as Lecture
    return lecture.expire > maintenant ? lecture : null
  } catch {
    return null
  }
}
