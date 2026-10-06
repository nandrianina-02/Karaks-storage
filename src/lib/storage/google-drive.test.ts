import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { GoogleDriveProvider, googleDriveAuthUrl } from './google-drive'

/**
 * Le fournisseur Drive face à un faux serveur Google : on vérifie le
 * protocole (jeton, plages, session reprenable), pas Google lui-même.
 */
interface Call {
  url: string
  method: string
  headers: Headers
  body?: unknown
}

function fakeGoogle(routes: (call: Call, index: number) => Response) {
  const calls: Call[] = []
  const fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const call = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: init.body,
    }
    calls.push(call)
    return routes(call, calls.length - 1)
  }) as typeof globalThis.fetch
  return { calls, fetch }
}

const token = () => Response.json({ access_token: 'acces-1', expires_in: 3600 })

function provider(fetch: typeof globalThis.fetch) {
  return new GoogleDriveProvider({ clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh', fetch })
}

describe('GoogleDriveProvider', () => {
  it('obtient un jeton puis le réutilise', async () => {
    const google = fakeGoogle((call) =>
      call.url.includes('oauth2') ? token() : Response.json({ id: 'dossier-1' }),
    )
    const drive = provider(google.fetch)
    assert.equal(await drive.createFolder('KARAKS STORAGE', null), 'dossier-1')
    await drive.createFolder('projects', 'dossier-1')
    assert.equal(google.calls.filter((call) => call.url.includes('oauth2')).length, 1)
    assert.equal(google.calls[1].headers.get('authorization'), 'Bearer acces-1')
    assert.match(String(google.calls[2].body), /"parents":\["dossier-1"\]/)
  })

  it('renouvelle le jeton une fois après un 401', async () => {
    let refused = false
    const google = fakeGoogle((call) => {
      if (call.url.includes('oauth2')) return token()
      if (!refused) {
        refused = true
        return new Response(null, { status: 401 })
      }
      return Response.json({ id: 'x' })
    })
    assert.equal(await provider(google.fetch).createFolder('a', null), 'x')
    assert.equal(google.calls.filter((call) => call.url.includes('oauth2')).length, 2)
  })

  it('signale un jeton révoqué comme une perte d’accès', async () => {
    const google = fakeGoogle(() => Response.json({ error: 'invalid_grant' }, { status: 400 }))
    await assert.rejects(provider(google.fetch).createFolder('a', null), (error: { authFailure: boolean }) => error.authFailure)
  })

  it('transmet la plage demandée au lecteur', async () => {
    const google = fakeGoogle((call) =>
      call.url.includes('oauth2') ? token() : new Response('abc', { status: 206 }),
    )
    const stream = await provider(google.fetch).createReadStream('fichier-1', { start: 10, end: 12 })
    assert.equal(await new Response(stream).text(), 'abc')
    assert.equal(google.calls[1].headers.get('range'), 'bytes=10-12')
    assert.match(google.calls[1].url, /files\/fichier-1\?alt=media$/)
  })

  it('suit une session reprenable jusqu’au fichier complet', async () => {
    const session = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=xyz'
    const google = fakeGoogle((call) => {
      if (call.url.includes('oauth2')) return token()
      if (call.method === 'POST') return new Response(null, { status: 200, headers: { Location: session } })
      const range = call.headers.get('content-range')
      if (range === 'bytes 0-3/6') return new Response(null, { status: 308, headers: { Range: 'bytes=0-3' } })
      if (range === 'bytes */6') return new Response(null, { status: 308, headers: { Range: 'bytes=0-3' } })
      return Response.json({ id: 'fichier-final', size: '6', md5Checksum: 'abc' }, { status: 200 })
    })
    const drive = provider(google.fetch)
    const ref = await drive.startResumable({ name: 'file_x.mp3', mimeType: 'audio/mpeg', parentId: 'p', size: 6 })
    assert.equal(ref, session)
    assert.equal(google.calls[1].headers.get('x-upload-content-length'), '6')

    assert.deepEqual(await drive.uploadChunk(ref, new Uint8Array(4), 0, 6), { received: 4, done: false })
    assert.deepEqual(await drive.queryResumable(ref, 6), { received: 4, done: false })
    const last = await drive.uploadChunk(ref, new Uint8Array(2), 4, 6)
    assert.equal(last.done, true)
    assert.deepEqual(last.object, { id: 'fichier-final', size: 6, checksum: 'abc' })
    // L'adresse de session porte l'autorisation : aucun jeton n'y est joint.
    assert.equal(google.calls.at(-1)!.headers.get('authorization'), null)
  })

  it('déplace un fichier d’un dossier à l’autre', async () => {
    const google = fakeGoogle((call) => (call.url.includes('oauth2') ? token() : Response.json({ id: 'f' })))
    await provider(google.fetch).update('f', { parentId: 'corbeille', previousParentId: 'audio' })
    const url = new URL(google.calls[1].url)
    assert.equal(url.searchParams.get('addParents'), 'corbeille')
    assert.equal(url.searchParams.get('removeParents'), 'audio')
    assert.equal(google.calls[1].method, 'PATCH')
  })

  it('considère comme supprimé un fichier déjà absent', async () => {
    const google = fakeGoogle((call) => (call.url.includes('oauth2') ? token() : new Response(null, { status: 404 })))
    await provider(google.fetch).delete('absent')
  })
})

describe('googleDriveAuthUrl', () => {
  it('demande un accès hors ligne limité aux fichiers de l’application', () => {
    const url = new URL(googleDriveAuthUrl({ clientId: 'id', redirectUri: 'http://localhost/cb', state: 'etat' }))
    assert.equal(url.searchParams.get('access_type'), 'offline')
    assert.equal(url.searchParams.get('prompt'), 'consent')
    assert.match(url.searchParams.get('scope')!, /auth\/drive\.file/)
    assert.doesNotMatch(url.searchParams.get('scope')!, /auth\/drive( |$)/)
  })
})
