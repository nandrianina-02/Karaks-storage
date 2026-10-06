/**
 * Contrat d'un fournisseur de stockage (CDS 29).
 *
 * Le code métier ne parle qu'à cette interface : passer de Google Drive à R2
 * ou S3 revient à écrire une nouvelle implémentation, sans toucher l'API
 * publique ni la base (CDS 2, 41). Les identifiants manipulés ici sont ceux
 * du fournisseur ; ils restent côté serveur.
 */

export interface StoredObject {
  /** Identifiant chez le fournisseur. */
  id: string
  size: number
  /** Empreinte calculée par le fournisseur, quand il en donne une. */
  checksum?: string
}

export interface ResumableState {
  /** Octets reçus et conservés par le fournisseur. */
  received: number
  done: boolean
  object?: StoredObject
}

export interface ObjectInfo {
  id: string
  name: string
  mimeType: string
  size: number
  checksum?: string
}

export interface StorageQuota {
  /** Octets disponibles en tout. Nul : pas de limite connue. */
  limit: number | null
  usage: number
  accountEmail?: string
}

export interface ByteRange {
  start: number
  end: number
}

export interface StorageProvider {
  readonly kind: 'GOOGLE_DRIVE' | 'LOCAL'

  createFolder(name: string, parentId: string | null): Promise<string>
  /** Envoi en une fois, pour les petits fichiers. */
  upload(input: { name: string; mimeType: string; parentId: string | null; data: Uint8Array }): Promise<StoredObject>

  /** Ouvre une session reprenable (CDS 12) et renvoie sa référence, à garder secrète. */
  startResumable(input: { name: string; mimeType: string; parentId: string | null; size: number }): Promise<string>
  uploadChunk(session: string, chunk: Uint8Array, start: number, total: number): Promise<ResumableState>
  /** Où en est une session interrompue : c'est de là que le client reprend. */
  queryResumable(session: string, total: number): Promise<ResumableState>
  abortResumable(session: string): Promise<void>

  createReadStream(id: string, range?: ByteRange): Promise<ReadableStream<Uint8Array>>
  get(id: string): Promise<ObjectInfo | null>
  list(parentId: string): Promise<ObjectInfo[]>
  update(id: string, change: { name?: string; parentId?: string; previousParentId?: string }): Promise<void>
  delete(id: string): Promise<void>
  quota(): Promise<StorageQuota>
}

/** Erreur du fournisseur, avec le statut HTTP d'origine quand il existe. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Le jeton d'accès a été refusé : la connexion est à refaire. */
    readonly authFailure = false,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

/**
 * Taille des morceaux de téléversement reprenable.
 *
 * Google Drive exige un multiple de 256 Kio pour tout morceau autre que le
 * dernier. 4 Mio passent sous la limite de 4,5 Mo par requête des fonctions
 * Vercel, tout en gardant un nombre raisonnable d'allers-retours.
 */
export const CHUNK_SIZE = 4 * 1024 * 1024
export const CHUNK_GRANULARITY = 256 * 1024
