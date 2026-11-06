import { AwsClient } from 'aws4fetch'

import { ErreurLecture } from './drive'

/**
 * Lecture d'un objet chez un fournisseur compatible S3 (R2, AWS S3, B2),
 * comme `S3Provider.createReadStream` de l'application : adressage par
 * chemin, même encodage de la clé, même signature (aws4fetch).
 */

export interface ConfigS3 {
  endpoint: string
  region: string
  bucket: string
}

export interface IdentifiantsS3 {
  accessKeyId: string
  secretAccessKey: string
}

/** Même lecture de `config` que `s3Config()` de l'application ; null si incomplète. */
export function configS3(config: unknown): ConfigS3 | null {
  if (!config || typeof config !== 'object') return null
  const c = config as Record<string, unknown>
  if (typeof c.endpoint !== 'string' || typeof c.bucket !== 'string') return null
  return { endpoint: c.endpoint, bucket: c.bucket, region: typeof c.region === 'string' && c.region ? c.region : 'auto' }
}

const encoderCle = (cle: string) => cle.split('/').map(encodeURIComponent).join('/')

export async function lireS3(options: {
  config: ConfigS3
  identifiants: IdentifiantsS3
  objet: string
  plage: { start: number; end: number } | null
  recuperer?: typeof fetch
}): Promise<Response> {
  const client = new AwsClient({ ...options.identifiants, service: 's3', region: options.config.region, retries: 1 })
  const url = `${options.config.endpoint.replace(/\/$/, '')}/${encodeURIComponent(options.config.bucket)}/${encoderCle(options.objet)}`
  const requete = await client.sign(url, { method: 'GET', headers: options.plage ? { Range: `bytes=${options.plage.start}-${options.plage.end}` } : {} })
  let reponse: Response
  try {
    reponse = await (options.recuperer ?? fetch)(requete)
  } catch {
    throw new ErreurLecture('Stockage S3 injoignable.', 503)
  }
  if (reponse.ok) return reponse
  if (reponse.status === 404) throw new ErreurLecture('Fichier absent du stockage.', 404)
  throw new ErreurLecture(`Le stockage S3 a répondu ${reponse.status}.`, 503)
}
