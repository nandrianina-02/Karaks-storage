import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

/**
 * Primitives cryptographiques du service.
 *
 * Volontairement indépendantes de la configuration : les secrets sont passés
 * en paramètre, ce qui rend chaque fonction testable sans environnement.
 */

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/**
 * Chaîne aléatoire en base 62.
 *
 * Le tirage rejette les octets au-delà du plus grand multiple de 62 : un
 * simple modulo favoriserait les premiers caractères de l'alphabet, et
 * affaiblirait d'autant les jetons.
 */
export function randomBase62(length: number): string {
  let out = ''
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248) out += BASE62[byte % 62]
      if (out.length === length) break
    }
  }
  return out
}

/**
 * Empreinte d'un secret à forte entropie (clé API, jeton de lien).
 *
 * Un HMAC plutôt qu'un hachage lent : ces secrets sont tirés au hasard sur
 * plus de 190 bits, l'attaque par dictionnaire ne s'applique pas, et la
 * vérification a lieu à chaque requête. Le poivre (`API_SECRET`) empêche en
 * plus d'exploiter une copie de la base sans le serveur (CDS 6.4).
 */
export function hashSecret(secret: string, pepper: string): string {
  return createHmac('sha256', pepper).update(secret).digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(`karaks-storage:${secret}`).digest()
}

/**
 * Chiffrement authentifié (AES-256-GCM) des secrets stockés en base : jeton
 * de rafraîchissement Google, secrets de webhooks.
 *
 * Format : `v1.<iv>.<tag>.<texte chiffré>`, en base64url. Le préfixe de
 * version permettra de changer d'algorithme sans perdre les anciennes valeurs.
 */
export function encrypt(plain: string, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv, tag, data].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join('.')
}

export function decrypt(payload: string, secret: string): string {
  const [version, iv, tag, data] = payload.split('.')
  if (version !== 'v1' || !iv || !tag || data === undefined) {
    throw new Error('Valeur chiffrée illisible.')
  }
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

/** Signature d'un webhook : le client recalcule ce HMAC pour authentifier l'envoi. */
export function signPayload(body: string, secret: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}
