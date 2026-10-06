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
 * Fournisseur Google Drive (CDS 8, V1).
 *
 * Écrit sur l'API REST de Drive v3 plutôt qu'avec le SDK `googleapis` : le
 * SDK pèse plusieurs dizaines de mégaoctets pour cinq appels, et l'accès
 * direct laisse la main sur ce qui compte ici — les requêtes de plage et le
 * protocole reprenable.
 *
 * Le compte n'accorde que le droit `drive.file` : l'application ne voit que
 * les fichiers qu'elle a créés. C'est aussi ce qui dispense de l'audit de
 * sécurité que Google impose aux applications qui demandent tout le Drive.
 */

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const FILE_FIELDS = 'id,name,mimeType,size,md5Checksum'

export const GOOGLE_DRIVE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive.file',
]

type Fetch = typeof fetch

export interface GoogleDriveOptions {
  clientId: string
  clientSecret: string
  refreshToken: string
  fetch?: Fetch
}

interface DriveFile {
  id: string
  name?: string
  mimeType?: string
  size?: string
  md5Checksum?: string
}

export class GoogleDriveProvider implements StorageProvider {
  readonly kind = 'GOOGLE_DRIVE' as const
  private accessToken: string | null = null
  private expiresAt = 0
  private readonly fetch: Fetch

  constructor(private readonly options: GoogleDriveOptions) {
    this.fetch = options.fetch ?? fetch
  }

  /** Jeton d'accès, renouvelé une minute avant son expiration. */
  private async token(force = false): Promise<string> {
    if (!force && this.accessToken && Date.now() < this.expiresAt - 60_000) {
      return this.accessToken
    }
    const response = await this.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        refresh_token: this.options.refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string
      expires_in?: number
      error?: string
    }
    if (!response.ok || !payload.access_token) {
      // `invalid_grant` : jeton révoqué, ou application restée en mode test
      // (Google invalide alors le jeton au bout de 7 jours).
      throw new ProviderError(
        `Google a refusé le renouvellement d'accès (${payload.error ?? response.status}).`,
        response.status,
        true,
      )
    }
    this.accessToken = payload.access_token
    this.expiresAt = Date.now() + (payload.expires_in ?? 3600) * 1000
    return this.accessToken
  }

  /**
   * Appel authentifié. Un 401 déclenche un seul renouvellement du jeton
   * puis une seconde tentative : le jeton peut avoir été révoqué côté Google
   * avant son expiration annoncée.
   */
  private async call(url: string, init: RequestInit = {}, accept: number[] = []): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${await this.token(attempt > 0)}`)
      const response = await this.fetch(url, { ...init, headers })
      if (response.status === 401 && attempt === 0) continue
      if (response.ok || accept.includes(response.status)) return response
      throw await this.failure(response)
    }
    throw new ProviderError('Accès à Google Drive refusé.', 401, true)
  }

  private async failure(response: Response): Promise<ProviderError> {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string }
    } | null
    const message = body?.error?.message ?? response.statusText
    return new ProviderError(`Google Drive : ${message}`, response.status, response.status === 401)
  }

  private static toObject(file: DriveFile): StoredObject {
    return { id: file.id, size: Number(file.size ?? 0), checksum: file.md5Checksum }
  }

  private static toInfo(file: DriveFile): ObjectInfo {
    return {
      id: file.id,
      name: file.name ?? '',
      mimeType: file.mimeType ?? 'application/octet-stream',
      size: Number(file.size ?? 0),
      checksum: file.md5Checksum,
    }
  }

  async createFolder(name: string, parentId: string | null): Promise<string> {
    const response = await this.call(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined }),
    })
    return ((await response.json()) as DriveFile).id
  }

  async upload(input: {
    name: string
    mimeType: string
    parentId: string | null
    data: Uint8Array
  }): Promise<StoredObject> {
    const boundary = `karaks${Date.now().toString(36)}`
    const metadata = JSON.stringify({ name: input.name, parents: input.parentId ? [input.parentId] : undefined })
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
          `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
      ),
      Buffer.from(input.data),
      Buffer.from(`\r\n--${boundary}--`),
    ])
    const response = await this.call(`${UPLOAD_API}/files?uploadType=multipart&fields=${FILE_FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })
    return GoogleDriveProvider.toObject((await response.json()) as DriveFile)
  }

  async startResumable(input: {
    name: string
    mimeType: string
    parentId: string | null
    size: number
  }): Promise<string> {
    const response = await this.call(`${UPLOAD_API}/files?uploadType=resumable&fields=${FILE_FIELDS}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': input.mimeType,
        'X-Upload-Content-Length': String(input.size),
      },
      body: JSON.stringify({ name: input.name, parents: input.parentId ? [input.parentId] : undefined }),
    })
    const location = response.headers.get('location')
    if (!location) throw new ProviderError('Google Drive n’a pas ouvert de session de téléversement.')
    return location
  }

  /**
   * Interprète la réponse d'une session reprenable : 308 signifie « reçu,
   * continuez », avec la plage déjà conservée dans l'en-tête `Range` ;
   * 200 ou 201, que le fichier est complet.
   */
  private async resumableState(response: Response): Promise<ResumableState> {
    if (response.status === 308) {
      const range = /bytes=0-(\d+)/.exec(response.headers.get('range') ?? '')
      return { received: range ? Number(range[1]) + 1 : 0, done: false }
    }
    const object = GoogleDriveProvider.toObject((await response.json()) as DriveFile)
    return { received: object.size, done: true, object }
  }

  async uploadChunk(session: string, chunk: Uint8Array, start: number, total: number): Promise<ResumableState> {
    const end = start + chunk.byteLength - 1
    // L'adresse de session porte elle-même l'autorisation : Google
    // recommande de ne pas y joindre de jeton, et elle survit à son expiration.
    const response = await this.fetch(session, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${start}-${end}/${total}` },
      body: Buffer.from(chunk),
    })
    if (response.status === 308 || response.ok) return this.resumableState(response)
    throw await this.failure(response)
  }

  async queryResumable(session: string, total: number): Promise<ResumableState> {
    const response = await this.fetch(session, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes */${total}` },
    })
    if (response.status === 308 || response.ok) return this.resumableState(response)
    throw await this.failure(response)
  }

  async abortResumable(session: string): Promise<void> {
    // Google répond 499 à une annulation réussie ; tout échec ici est sans
    // conséquence, la session expire d'elle-même au bout d'une semaine.
    await this.fetch(session, { method: 'DELETE' }).catch(() => undefined)
  }

  async createReadStream(id: string, range?: ByteRange): Promise<ReadableStream<Uint8Array>> {
    const headers: HeadersInit = range ? { Range: `bytes=${range.start}-${range.end}` } : {}
    const response = await this.call(`${API}/files/${encodeURIComponent(id)}?alt=media`, { headers })
    if (!response.body) throw new ProviderError('Google Drive a renvoyé une réponse vide.')
    return response.body
  }

  async get(id: string): Promise<ObjectInfo | null> {
    const response = await this.call(
      `${API}/files/${encodeURIComponent(id)}?fields=${FILE_FIELDS},trashed`,
      {},
      [404],
    )
    if (response.status === 404) return null
    return GoogleDriveProvider.toInfo((await response.json()) as DriveFile)
  }

  async list(parentId: string): Promise<ObjectInfo[]> {
    const items: ObjectInfo[] = []
    let pageToken: string | undefined
    do {
      const query = new URLSearchParams({
        q: `'${parentId.replace(/'/g, "\\'")}' in parents and trashed = false`,
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        pageSize: '1000',
      })
      if (pageToken) query.set('pageToken', pageToken)
      const response = await this.call(`${API}/files?${query}`)
      const payload = (await response.json()) as { files: DriveFile[]; nextPageToken?: string }
      items.push(...payload.files.map(GoogleDriveProvider.toInfo))
      pageToken = payload.nextPageToken
    } while (pageToken)
    return items
  }

  async update(id: string, change: { name?: string; parentId?: string; previousParentId?: string }): Promise<void> {
    const query = new URLSearchParams({ fields: 'id' })
    if (change.parentId) query.set('addParents', change.parentId)
    if (change.parentId && change.previousParentId) query.set('removeParents', change.previousParentId)
    await this.call(`${API}/files/${encodeURIComponent(id)}?${query}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(change.name ? { name: change.name } : {}),
    })
  }

  async delete(id: string): Promise<void> {
    // Un objet déjà absent est considéré comme supprimé : la suppression
    // définitive doit pouvoir être rejouée après une interruption.
    await this.call(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' }, [404])
  }

  async quota(): Promise<StorageQuota> {
    const response = await this.call(`${API}/about?fields=user(emailAddress),storageQuota(limit,usage)`)
    const payload = (await response.json()) as {
      user?: { emailAddress?: string }
      storageQuota?: { limit?: string; usage?: string }
    }
    return {
      limit: payload.storageQuota?.limit ? Number(payload.storageQuota.limit) : null,
      usage: Number(payload.storageQuota?.usage ?? 0),
      accountEmail: payload.user?.emailAddress,
    }
  }
}

/** Adresse d'autorisation Google pour relier un Drive (accès hors ligne). */
export function googleDriveAuthUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const query = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: GOOGLE_DRIVE_SCOPES.join(' '),
    // `offline` et `consent` : sans eux, Google ne renvoie le jeton de
    // rafraîchissement qu'à la toute première autorisation, et une
    // reconnexion laisserait le service sans accès durable.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: input.state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${query}`
}

export async function exchangeGoogleCode(input: {
  clientId: string
  clientSecret: string
  redirectUri: string
  code: string
  fetch?: Fetch
}): Promise<{ refreshToken: string; email: string | null; scope: string }> {
  const response = await (input.fetch ?? fetch)(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
      grant_type: 'authorization_code',
    }),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    refresh_token?: string
    id_token?: string
    scope?: string
    error?: string
  }
  if (!response.ok || !payload.refresh_token) {
    throw new ProviderError(
      payload.error
        ? `Google a refusé l'autorisation (${payload.error}).`
        : 'Google n’a pas fourni de jeton durable.',
      response.status,
    )
  }
  return {
    refreshToken: payload.refresh_token,
    email: emailFromIdToken(payload.id_token),
    scope: payload.scope ?? '',
  }
}

/** Lit l'adresse du jeton d'identité, reçu directement de Google en TLS. */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')) as {
      email?: string
    }
    return payload.email ?? null
  } catch {
    return null
  }
}
