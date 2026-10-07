import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { PART_SIZE, S3Provider } from './s3'

/**
 * Faux service S3 en mémoire, juste assez fidèle pour l'envoi en plusieurs
 * parties : il refuse, comme R2, une partie autre que la dernière qui ne
 * ferait pas la taille des autres ou moins de 5 Mio.
 */
function fakeS3() {
  const objects = new Map<string, { body: Uint8Array; type: string; meta: string | null }>()
  const uploads = new Map<string, Map<number, Uint8Array>>()
  let counter = 0
  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const key = decodeURIComponent(url.pathname.split('/').slice(2).join('/'))
    const body = new Uint8Array(await request.arrayBuffer())
    const method = request.method
    if (url.searchParams.has('uploads') && method === 'POST') {
      const id = `up${++counter}`
      uploads.set(id, new Map())
      return new Response(`<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`)
    }
    const uploadId = url.searchParams.get('uploadId')
    if (uploadId) {
      const parts = uploads.get(uploadId)
      if (!parts) return new Response('<Error><Code>NoSuchUpload</Code></Error>', { status: 404 })
      if (method === 'PUT') {
        const number = Number(url.searchParams.get('partNumber'))
        parts.set(number, body)
        return new Response(null, { headers: { etag: `"etag-${number}"` } })
      }
      if (method === 'DELETE') {
        uploads.delete(uploadId)
        return new Response(null, { status: 204 })
      }
      const numbers = [...String(new TextDecoder().decode(body)).matchAll(/<PartNumber>(\d+)<\/PartNumber>/g)].map((match) => Number(match[1]))
      const sizes = numbers.map((number) => parts.get(number)!.byteLength)
      const head = sizes.slice(0, -1)
      if (head.some((size) => size < 5 * 1024 * 1024 || size !== head[0])) {
        return new Response('<Error><Code>EntityTooSmall</Code></Error>', { status: 400 })
      }
      const total = new Uint8Array(sizes.reduce((a, b) => a + b, 0))
      let offset = 0
      for (const number of numbers) {
        total.set(parts.get(number)!, offset)
        offset += parts.get(number)!.byteLength
      }
      objects.set(key, { body: total, type: 'application/octet-stream', meta: null })
      uploads.delete(uploadId)
      return new Response('<CompleteMultipartUploadResult><ETag>"final"</ETag></CompleteMultipartUploadResult>')
    }
    if (method === 'PUT') {
      objects.set(key, { body, type: request.headers.get('content-type') ?? 'application/octet-stream', meta: request.headers.get('x-amz-meta-name') })
      return new Response(null, { headers: { etag: '"x"' } })
    }
    const object = objects.get(key)
    if (method === 'DELETE') {
      objects.delete(key)
      return new Response(null, { status: 204 })
    }
    if (!object) return new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 })
    const headers = { 'content-length': String(object.body.byteLength), 'content-type': object.type, ...(object.meta ? { 'x-amz-meta-name': object.meta } : {}) }
    if (method === 'HEAD') return new Response(null, { headers })
    const range = request.headers.get('range')?.match(/bytes=(\d+)-(\d+)/)
    if (range) return new Response(Buffer.from(object.body.slice(Number(range[1]), Number(range[2]) + 1)), { status: 206 })
    return new Response(Buffer.from(object.body), { headers })
  }
  return { fetch: handler, objects, uploads }
}

const MB = 1024 * 1024

function provider(fake: ReturnType<typeof fakeS3>) {
  const s3 = new S3Provider({ endpoint: 'https://s3.exemple', region: 'auto', bucket: 'b', accessKeyId: 'a', secretAccessKey: 's' })
  // aws4fetch appelle le `fetch` global : on le remplace le temps du test.
  globalThis.fetch = fake.fetch as typeof fetch
  return s3
}

function bytes(size: number, seed = 7) {
  const data = new Uint8Array(size)
  for (let index = 0; index < size; index += 1) data[index] = (index * seed) % 251
  return data
}

describe('S3Provider', () => {
  const realFetch = globalThis.fetch

  it('assemble des morceaux de 4 Mio en parties égales de 8 Mio', async () => {
    const fake = fakeS3()
    const s3 = provider(fake)
    try {
      const data = bytes(21 * MB + 123)
      const session = await s3.startResumable({ name: 'file_a.mp3', mimeType: 'audio/mpeg', parentId: null, size: data.byteLength })
      let state
      for (let start = 0; start < data.byteLength; start += 4 * MB) {
        state = await s3.uploadChunk(session, data.subarray(start, start + 4 * MB), start, data.byteLength)
        if (start + 4 * MB < data.byteLength) assert.equal(state.received, start + 4 * MB)
      }
      assert.equal(state!.done, true)
      assert.equal(state!.object!.id, 'files/file_a.mp3')
      assert.deepEqual(fake.objects.get('files/file_a.mp3')!.body, data)
      // Plus d'objet d'état une fois l'envoi assemblé.
      assert.equal([...fake.objects.keys()].filter((key) => key.startsWith('tmp/')).length, 0)
      assert.equal(PART_SIZE, 8 * MB)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('ignore un morceau en double et reprend à la position réelle', async () => {
    const fake = fakeS3()
    const s3 = provider(fake)
    try {
      const data = bytes(10 * MB, 3)
      const session = await s3.startResumable({ name: 'file_b.mp4', mimeType: 'video/mp4', parentId: null, size: data.byteLength })
      await s3.uploadChunk(session, data.subarray(0, 4 * MB), 0, data.byteLength)
      const duplicate = await s3.uploadChunk(session, data.subarray(0, 4 * MB), 0, data.byteLength)
      assert.equal(duplicate.received, 4 * MB)
      assert.equal((await s3.queryResumable(session, data.byteLength)).received, 4 * MB)
      await s3.uploadChunk(session, data.subarray(4 * MB, 8 * MB), 4 * MB, data.byteLength)
      const done = await s3.uploadChunk(session, data.subarray(8 * MB), 8 * MB, data.byteLength)
      assert.equal(done.done, true)
      assert.deepEqual(fake.objects.get('files/file_b.mp4')!.body, data)
      assert.equal((await s3.queryResumable(session, data.byteLength)).done, true)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('lit par plage et retrouve le nom d’origine', async () => {
    const fake = fakeS3()
    const s3 = provider(fake)
    try {
      const data = bytes(1000)
      const stored = await s3.upload({ name: 'file_c.png', mimeType: 'image/png', parentId: null, data })
      const stream = await s3.createReadStream(stored.id, { start: 10, end: 19 })
      const read = new Uint8Array(await new Response(stream).arrayBuffer())
      assert.deepEqual(read, data.subarray(10, 20))
      const info = await s3.get(stored.id)
      assert.equal(info?.name, 'file_c.png')
      assert.equal(info?.mimeType, 'image/png')
      await s3.delete(stored.id)
      assert.equal(await s3.get(stored.id), null)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('signe une adresse de lecture directe', async () => {
    const s3 = new S3Provider({ endpoint: 'https://compte.r2.cloudflarestorage.com', region: 'auto', bucket: 'medias', accessKeyId: 'a', secretAccessKey: 's' })
    const url = new URL(await s3.presignedUrl('files/file_d.mp3', { expiresIn: 600, fileName: 'Chanson été.mp3', contentType: 'audio/mpeg', disposition: 'inline' }))
    assert.equal(url.pathname, '/medias/files/file_d.mp3')
    assert.equal(url.searchParams.get('X-Amz-Expires'), '600')
    assert.ok(url.searchParams.get('X-Amz-Signature'))
    assert.match(url.searchParams.get('response-content-disposition')!, /Chanson%20%C3%A9t%C3%A9\.mp3/)
  })
})
