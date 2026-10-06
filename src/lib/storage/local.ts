import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { appendFile, mkdir, readFile, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'

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
 * Fournisseur disque, réservé au développement et aux tests.
 *
 * Il reproduit le comportement de Google Drive — dossiers, sessions
 * reprenables, lecture par plages — sans compte Google, ce qui permet de
 * dérouler toute la chaîne en local. Il est refusé en production sauf
 * activation explicite (`STORAGE_ALLOW_LOCAL`) : un disque de serveur
 * applicatif n'est ni sauvegardé ni partagé entre instances.
 */
interface Meta {
  name: string
  mimeType: string
  parentId: string | null
  folder?: boolean
}

const ID = /^[0-9a-f-]{36}$/

export class LocalProvider implements StorageProvider {
  readonly kind = 'LOCAL' as const
  private readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  private path(kind: 'objects' | 'uploads', id: string): string {
    // L'identifiant vient de la base, mais on refuse tout ce qui n'a pas la
    // forme attendue : aucun chemin ne doit pouvoir sortir du dossier.
    if (!ID.test(id)) throw new ProviderError('Identifiant de stockage invalide.', 400)
    return join(this.root, kind, id)
  }

  private async ensure() {
    await mkdir(join(this.root, 'objects'), { recursive: true })
    await mkdir(join(this.root, 'uploads'), { recursive: true })
  }

  private async writeMeta(id: string, meta: Meta) {
    await writeFile(`${this.path('objects', id)}.json`, JSON.stringify(meta))
  }

  private async readMeta(id: string): Promise<Meta | null> {
    try {
      return JSON.parse(await readFile(`${this.path('objects', id)}.json`, 'utf8')) as Meta
    } catch {
      return null
    }
  }

  private async describe(id: string): Promise<StoredObject> {
    const data = await readFile(this.path('objects', id))
    return { id, size: data.byteLength, checksum: createHash('md5').update(data).digest('hex') }
  }

  async createFolder(name: string, parentId: string | null): Promise<string> {
    await this.ensure()
    const id = randomUUID()
    await this.writeMeta(id, { name, mimeType: 'folder', parentId, folder: true })
    return id
  }

  async upload(input: { name: string; mimeType: string; parentId: string | null; data: Uint8Array }): Promise<StoredObject> {
    await this.ensure()
    const id = randomUUID()
    await writeFile(this.path('objects', id), input.data)
    await this.writeMeta(id, { name: input.name, mimeType: input.mimeType, parentId: input.parentId })
    return this.describe(id)
  }

  async startResumable(input: { name: string; mimeType: string; parentId: string | null; size: number }): Promise<string> {
    await this.ensure()
    const session = randomUUID()
    await writeFile(this.path('uploads', session), new Uint8Array())
    await writeFile(
      `${this.path('uploads', session)}.json`,
      JSON.stringify({ name: input.name, mimeType: input.mimeType, parentId: input.parentId, size: input.size }),
    )
    return session
  }

  private async received(session: string): Promise<number> {
    try {
      return (await stat(this.path('uploads', session))).size
    } catch {
      throw new ProviderError('Session de téléversement introuvable.', 404)
    }
  }

  private async complete(session: string): Promise<ResumableState> {
    const meta = JSON.parse(await readFile(`${this.path('uploads', session)}.json`, 'utf8')) as Meta
    const id = randomUUID()
    await rename(this.path('uploads', session), this.path('objects', id))
    await rm(`${this.path('uploads', session)}.json`, { force: true })
    await this.writeMeta(id, { name: meta.name, mimeType: meta.mimeType, parentId: meta.parentId })
    const object = await this.describe(id)
    return { received: object.size, done: true, object }
  }

  async uploadChunk(session: string, chunk: Uint8Array, start: number, total: number): Promise<ResumableState> {
    const current = await this.received(session)
    // Même règle que Drive : un morceau doit commencer exactement là où la
    // session s'est arrêtée, sinon le fichier serait troué ou dupliqué.
    if (start !== current) return { received: current, done: false }
    await appendFile(this.path('uploads', session), chunk)
    const received = current + chunk.byteLength
    if (received >= total) return this.complete(session)
    return { received, done: false }
  }

  async queryResumable(session: string, total: number): Promise<ResumableState> {
    const received = await this.received(session)
    if (received >= total) return this.complete(session)
    return { received, done: false }
  }

  async abortResumable(session: string): Promise<void> {
    await rm(this.path('uploads', session), { force: true })
    await rm(`${this.path('uploads', session)}.json`, { force: true })
  }

  async createReadStream(id: string, range?: ByteRange): Promise<ReadableStream<Uint8Array>> {
    const path = this.path('objects', id)
    await stat(path).catch(() => {
      throw new ProviderError('Objet introuvable dans le stockage.', 404)
    })
    const stream = createReadStream(path, range ? { start: range.start, end: range.end } : {})
    return Readable.toWeb(stream) as ReadableStream<Uint8Array>
  }

  async get(id: string): Promise<ObjectInfo | null> {
    const meta = await this.readMeta(id)
    if (!meta) return null
    if (meta.folder) return { id, name: meta.name, mimeType: 'folder', size: 0 }
    const object = await this.describe(id)
    return { id, name: meta.name, mimeType: meta.mimeType, size: object.size, checksum: object.checksum }
  }

  async list(parentId: string): Promise<ObjectInfo[]> {
    await this.ensure()
    const entries = await readdir(join(this.root, 'objects'))
    const items: ObjectInfo[] = []
    for (const entry of entries.filter((name) => name.endsWith('.json'))) {
      const id = entry.slice(0, -5)
      const meta = await this.readMeta(id)
      if (meta?.parentId === parentId) {
        const info = await this.get(id)
        if (info) items.push(info)
      }
    }
    return items
  }

  async update(id: string, change: { name?: string; parentId?: string }): Promise<void> {
    const meta = await this.readMeta(id)
    if (!meta) throw new ProviderError('Objet introuvable dans le stockage.', 404)
    await this.writeMeta(id, {
      ...meta,
      name: change.name ?? meta.name,
      parentId: change.parentId ?? meta.parentId,
    })
  }

  async delete(id: string): Promise<void> {
    await rm(this.path('objects', id), { force: true })
    await rm(`${this.path('objects', id)}.json`, { force: true })
  }

  async quota(): Promise<StorageQuota> {
    await this.ensure()
    const entries = await readdir(join(this.root, 'objects'))
    let usage = 0
    for (const entry of entries.filter((name) => !name.endsWith('.json'))) {
      usage += (await stat(join(this.root, 'objects', entry))).size
    }
    const fs = await statfs(this.root).catch(() => null)
    return { limit: fs ? usage + fs.bavail * fs.bsize : null, usage }
  }
}
