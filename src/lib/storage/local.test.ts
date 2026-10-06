import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { LocalProvider } from './local'

let root = ''
let storage: LocalProvider
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'karaks-storage-'))
  storage = new LocalProvider(root)
})
after(() => rm(root, { recursive: true, force: true }))

describe('LocalProvider', () => {
  it('téléverse, relit par plage et supprime', async () => {
    const folder = await storage.createFolder('audio', null)
    const stored = await storage.upload({
      name: 'a.txt',
      mimeType: 'text/plain',
      parentId: folder,
      data: new TextEncoder().encode('0123456789'),
    })
    assert.equal(stored.size, 10)
    assert.equal(await new Response(await storage.createReadStream(stored.id, { start: 2, end: 4 })).text(), '234')
    assert.deepEqual((await storage.list(folder)).map((item) => item.id), [stored.id])
    await storage.delete(stored.id)
    assert.equal(await storage.get(stored.id), null)
  })

  it('reprend une session interrompue là où elle s’est arrêtée', async () => {
    const session = await storage.startResumable({ name: 'b.txt', mimeType: 'text/plain', parentId: null, size: 6 })
    assert.deepEqual(await storage.uploadChunk(session, new TextEncoder().encode('abc'), 0, 6), { received: 3, done: false })
    // Un morceau rejoué n'est pas ajouté une seconde fois.
    assert.deepEqual(await storage.uploadChunk(session, new TextEncoder().encode('abc'), 0, 6), { received: 3, done: false })
    assert.deepEqual(await storage.queryResumable(session, 6), { received: 3, done: false })
    const done = await storage.uploadChunk(session, new TextEncoder().encode('def'), 3, 6)
    assert.equal(done.done, true)
    assert.equal(await new Response(await storage.createReadStream(done.object!.id)).text(), 'abcdef')
  })

  it('refuse un identifiant qui sortirait du dossier', async () => {
    await assert.rejects(storage.createReadStream('../../etc/passwd'))
  })
})
