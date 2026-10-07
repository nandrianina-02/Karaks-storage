import { createHash, randomBytes } from 'node:crypto'

import { AwsClient } from 'aws4fetch'

import {
  ProviderError,
  type ByteRange,
  type ObjectInfo,
  type ResumableState,
  type StorageProvider,
  type StorageQuota,
  type StoredObject,
} from '@/lib/storage/provider'

/**
 * Fournisseur compatible S3 (CDS V3) : Cloudflare R2, AWS S3, Backblaze B2,
 * Scaleway, MinIO.
 *
 * Écrit sur l'API REST avec une signature AWS v4 (aws4fetch) plutôt qu'avec
 * le SDK d'AWS, pour la même raison que Google Drive : quelques appels, et la
 * main sur les requêtes de plage.
 *
 * S3 n'a pas de dossiers : l'arborescence vit dans la base, et les objets
 * sont rangés à plat sous `files/`. Déplacer ou renommer un fichier ne touche
 * donc pas le stockage.
 */
export interface S3Options {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** Volume stocké, compté par l'application : S3 ne donne pas de quota. */
  usage?: () => Promise<number>
  fetch?: typeof fetch
}

/**
 * Taille fixe des parties d'un envoi en plusieurs parties.
 *
 * S3 refuse une partie de moins de 5 Mio, sauf la dernière, et R2 exige en
 * plus que toutes les parties sauf la dernière aient la même taille. Les
 * morceaux du client font 4 Mio (limite des fonctions Vercel) : ils sont
 * cumulés dans un objet d'attente jusqu'à former une partie de 8 Mio.
 */
export const PART_SIZE = 8 * 1024 * 1024

interface Session {
  key: string
  uploadId: string
}

interface Part {
  number: number
  etag: string
  size: number
}

function encodeKey(key: string) {
  return key.split('/').map(encodeURIComponent).join('/')
}

function xmlValues(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((match) => match[1])
}

function xmlUnescape(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/** Corps de requête binaire : `fetch` attend un tampon qui lui appartient. */
function body(data: Uint8Array): BodyInit {
  return Buffer.from(data)
}

function concat(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.byteLength + b.byteLength)
  out.set(a, 0)
  out.set(b, a.byteLength)
  return out
}

export class S3Provider implements StorageProvider {
  readonly kind = 'S3' as const
  private readonly client: AwsClient
  private readonly base: string

  constructor(private readonly options: S3Options) {
    this.client = new AwsClient({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      service: 's3',
      region: options.region || 'auto',
      retries: 2,
    })
    // Adressage par chemin : il marche partout, R2 et MinIO compris, sans
    // dépendre d'un DNS par compartiment.
    this.base = `${options.endpoint.replace(/\/$/, '')}/${encodeURIComponent(options.bucket)}`
  }

  private url(key: string, query?: Record<string, string>) {
    const url = new URL(`${this.base}/${encodeKey(key)}`)
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value)
    return url.toString()
  }

  private async call(url: string, init: RequestInit & { allow404?: boolean } = {}): Promise<Response | null> {
    const { allow404, ...rest } = init
    let response: Response
    try {
      response = await this.client.fetch(url, rest)
    } catch (error) {
      throw new ProviderError(`Stockage S3 injoignable : ${error instanceof Error ? error.message : 'erreur réseau'}`, 503)
    }
    if (response.status === 404 && allow404) return null
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      const code = xmlValues(body, 'Code')[0] ?? `HTTP ${response.status}`
      const message = xmlValues(body, 'Message')[0]
      const auth = ['InvalidAccessKeyId', 'SignatureDoesNotMatch', 'AccessDenied', 'ExpiredToken'].includes(code)
      throw new ProviderError(`S3 : ${code}${message ? ` (${message})` : ''}`, response.status, auth)
    }
    return response
  }

  /**
   * Vérifie l'accès au compartiment avant d'enregistrer des identifiants :
   * lecture, écriture et suppression d'un petit objet, les trois droits dont
   * le service a besoin. Une clé en lecture seule passerait une simple liste.
   */
  async check(): Promise<void> {
    await this.call(`${this.base}?list-type=2&max-keys=1`)
    const probe = `tmp/verification-${randomBytes(6).toString('hex')}`
    await this.call(this.url(probe), { method: 'PUT', body: 'karaks-storage' })
    await this.call(this.url(probe), { method: 'DELETE' })
  }

  async createFolder(): Promise<string> {
    // Dossier virtuel : un identifiant suffit, il n'existe que dans la base.
    return `dir_${randomBytes(9).toString('base64url')}`
  }

  async upload(input: { name: string; mimeType: string; parentId: string | null; data: Uint8Array }): Promise<StoredObject> {
    const key = `files/${input.name}`
    const response = await this.call(this.url(key), {
      method: 'PUT',
      body: body(input.data),
      headers: { 'Content-Type': input.mimeType, 'x-amz-meta-name': encodeURIComponent(input.name) },
    })
    return { id: key, size: input.data.byteLength, checksum: response?.headers.get('etag')?.replace(/"/g, '') }
  }

  // --- Envoi reprenable, par parties ---------------------------------------

  private encodeSession(session: Session) {
    return Buffer.from(JSON.stringify(session)).toString('base64url')
  }

  private decodeSession(value: string): Session {
    try {
      const session = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Session
      if (typeof session.key === 'string' && typeof session.uploadId === 'string') return session
    } catch {
      // Traité ci-dessous.
    }
    throw new ProviderError('Session de téléversement S3 illisible.', 400)
  }

  /**
   * Deux objets d'état par envoi, dans le compartiment lui-même : la liste
   * des parties déjà confiées à S3 (avec leur ETag, nécessaire à
   * l'assemblage) et les octets reçus qui ne forment pas encore une partie.
   * L'état survit ainsi d'une fonction serverless à l'autre sans table en
   * base, et sans dépendre de `ListParts`, que tous les services compatibles
   * n'implémentent pas.
   */
  private stateKeys(session: Session) {
    const id = createHash('sha256').update(session.uploadId).digest('hex').slice(0, 32)
    return { manifest: `tmp/${id}.json`, pending: `tmp/${id}.part` }
  }

  async startResumable(input: { name: string; mimeType: string; parentId: string | null; size: number }): Promise<string> {
    const key = `files/${input.name}`
    const response = await this.call(this.url(key, { uploads: '' }), {
      method: 'POST',
      headers: { 'Content-Type': input.mimeType, 'x-amz-meta-name': encodeURIComponent(input.name) },
    })
    const uploadId = xmlValues(await response!.text(), 'UploadId')[0]
    if (!uploadId) throw new ProviderError('S3 n’a pas ouvert l’envoi en plusieurs parties.', 502)
    return this.encodeSession({ key, uploadId: xmlUnescape(uploadId) })
  }

  private async readParts(session: Session): Promise<Part[]> {
    const response = await this.call(this.url(this.stateKeys(session).manifest), { allow404: true })
    if (!response) return []
    const parts = (await response.json().catch(() => [])) as Part[]
    return Array.isArray(parts) ? parts : []
  }

  private async readPending(session: Session): Promise<Uint8Array> {
    const response = await this.call(this.url(this.stateKeys(session).pending), { allow404: true })
    return response ? new Uint8Array(await response.arrayBuffer()) : new Uint8Array(0)
  }

  private async pendingSize(session: Session): Promise<number> {
    const response = await this.call(this.url(this.stateKeys(session).pending), { method: 'HEAD', allow404: true })
    return response ? Number(response.headers.get('content-length') ?? 0) : 0
  }

  private async uploadPart(session: Session, number: number, data: Uint8Array): Promise<Part> {
    const response = await this.call(this.url(session.key, { partNumber: String(number), uploadId: session.uploadId }), { method: 'PUT', body: body(data) })
    const etag = response!.headers.get('etag')
    if (!etag) throw new ProviderError('S3 n’a pas confirmé la partie envoyée.', 502)
    return { number, etag, size: data.byteLength }
  }

  private async putState(key: string, data: Uint8Array | string | null) {
    if (data === null) await this.call(this.url(key), { method: 'DELETE', allow404: true })
    else await this.call(this.url(key), { method: 'PUT', body: typeof data === 'string' ? data : body(data) })
  }

  /**
   * Chaque étape laisse un état cohérent si la suivante échoue : au pire, la
   * position reçue recule, et le client renvoie les octets manquants. Le
   * tampon d'attente est vidé avant l'envoi des parties qu'il alimente, pour
   * qu'un octet ne soit jamais compté à la fois dans une partie et dans le
   * tampon.
   */
  async uploadChunk(value: string, chunk: Uint8Array, start: number, total: number): Promise<ResumableState> {
    const session = this.decodeSession(value)
    const keys = this.stateKeys(session)
    const parts = await this.readParts(session)
    const committed = parts.reduce((sum, part) => sum + part.size, 0)
    let buffer = await this.readPending(session)
    // Un morceau qui n'arrive pas à la suite est ignoré : l'appelant reçoit
    // la position réelle et s'y recale.
    if (start !== committed + buffer.byteLength) return { received: committed + buffer.byteLength, done: false }

    buffer = concat(buffer, chunk)
    const last = start + chunk.byteLength >= total
    const fullParts = Math.floor(buffer.byteLength / PART_SIZE)

    if (fullParts > 0) {
      await this.putState(keys.pending, null)
      let number = (parts.at(-1)?.number ?? 0) + 1
      for (let index = 0; index < fullParts; index += 1) {
        parts.push(await this.uploadPart(session, number++, buffer.subarray(index * PART_SIZE, (index + 1) * PART_SIZE)))
      }
      await this.putState(keys.manifest, JSON.stringify(parts))
    }
    const rest = buffer.subarray(fullParts * PART_SIZE)

    if (!last) {
      if (rest.byteLength > 0) await this.putState(keys.pending, rest)
      return { received: start + chunk.byteLength, done: false }
    }

    // Dernier morceau : le reste part comme dernière partie, puis l'envoi est
    // assemblé.
    if (rest.byteLength > 0 || parts.length === 0) {
      parts.push(await this.uploadPart(session, (parts.at(-1)?.number ?? 0) + 1, rest))
    }
    const body =
      '<CompleteMultipartUpload>' +
      parts.map((part) => `<Part><PartNumber>${part.number}</PartNumber><ETag>${part.etag}</ETag></Part>`).join('') +
      '</CompleteMultipartUpload>'
    const response = await this.call(this.url(session.key, { uploadId: session.uploadId }), {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/xml' },
    })
    // S3 peut répondre 200 avec une erreur dans le corps.
    const xml = await response!.text()
    if (xml.includes('<Error>')) throw new ProviderError(`S3 : ${xmlValues(xml, 'Code')[0] ?? 'assemblage refusé'}`, 502)
    await Promise.all([this.putState(keys.pending, null), this.putState(keys.manifest, null)]).catch(() => undefined)
    return { received: total, done: true, object: { id: session.key, size: total, checksum: xmlValues(xml, 'ETag')[0]?.replace(/&quot;|"/g, '') } }
  }

  async queryResumable(value: string, total: number): Promise<ResumableState> {
    const session = this.decodeSession(value)
    const [parts, pending] = await Promise.all([this.readParts(session), this.pendingSize(session)])
    const received = parts.reduce((sum, part) => sum + part.size, 0) + pending
    if (received === 0) {
      // Rien en attente : envoi pas encore commencé, ou déjà assemblé.
      const info = await this.get(session.key)
      if (info && info.size === total) return { received: total, done: true, object: { id: info.id, size: info.size, checksum: info.checksum } }
    }
    return { received, done: false }
  }

  async abortResumable(value: string): Promise<void> {
    const session = this.decodeSession(value)
    const keys = this.stateKeys(session)
    // Un service qui ne connaît pas l'annulation garde des parties
    // orphelines ; R2 et S3 les purgent eux-mêmes après quelques jours.
    await this.call(this.url(session.key, { uploadId: session.uploadId }), { method: 'DELETE', allow404: true }).catch(() => undefined)
    await Promise.all([this.putState(keys.pending, null), this.putState(keys.manifest, null)])
  }

  // --- Lecture et gestion --------------------------------------------------

  async createReadStream(id: string, range?: ByteRange): Promise<ReadableStream<Uint8Array>> {
    const response = await this.call(this.url(id), { headers: range ? { Range: `bytes=${range.start}-${range.end}` } : {} })
    if (!response!.body) throw new ProviderError('S3 a renvoyé une réponse vide.', 502)
    return response!.body
  }

  async get(id: string): Promise<ObjectInfo | null> {
    const response = await this.call(this.url(id), { method: 'HEAD', allow404: true })
    if (!response) return null
    const name = response.headers.get('x-amz-meta-name')
    return {
      id,
      name: name ? decodeURIComponent(name) : id.split('/').pop()!,
      mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
      size: Number(response.headers.get('content-length') ?? 0),
      checksum: response.headers.get('etag')?.replace(/"/g, ''),
    }
  }

  async list(): Promise<ObjectInfo[]> {
    // Pas de dossiers chez S3 : le contenu d'un dossier se lit dans la base.
    return []
  }

  async update(): Promise<void> {
    // Nom et dossier ne vivent que dans la base : rien à faire chez S3.
  }

  async delete(id: string): Promise<void> {
    if (id.startsWith('dir_')) return
    await this.call(this.url(id), { method: 'DELETE', allow404: true })
  }

  async quota(): Promise<StorageQuota> {
    return { limit: null, usage: this.options.usage ? await this.options.usage() : 0 }
  }

  /**
   * Adresse de lecture signée, valable `expiresIn` secondes : le navigateur
   * lit alors directement chez le fournisseur, sans passer par le serveur.
   */
  async presignedUrl(id: string, options: { expiresIn: number; fileName: string; contentType: string; disposition: 'inline' | 'attachment' }) {
    const url = new URL(this.url(id))
    url.searchParams.set('X-Amz-Expires', String(Math.max(60, Math.min(options.expiresIn, 7 * 86_400))))
    url.searchParams.set('response-content-type', options.contentType)
    url.searchParams.set('response-content-disposition', `${options.disposition}; filename*=UTF-8''${encodeURIComponent(options.fileName)}`)
    const signed = await this.client.sign(url.toString(), { method: 'GET', aws: { signQuery: true } })
    return signed.url
  }
}
