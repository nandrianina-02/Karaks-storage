import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { encrypt, hashSecret } from '../../../src/lib/security/crypto'
import { adressePostgres, type Base, type CleApi, type Fichier } from '../src/base'
import { chiffrerLecture, dechiffrer, dechiffrerAvec, empreinte, lireLecture, type Lecture } from '../src/chiffrement'
import { oublierJetons } from '../src/drive'
import { creerLecteur, type Env } from '../src/index'

const ENV: Env = {
  DATABASE_URL: 'postgres://inutile',
  API_SECRET: 'secret-api-de-test-0123456789abcdef0123',
  ENCRYPTION_KEY: 'cle-de-chiffrement-de-test-0123456789abcd',
  GOOGLE_CLIENT_ID: 'client',
  GOOGLE_CLIENT_SECRET: 'secret',
  ORIGINE: 'https://stockage.exemple',
}
const CLE = `ks_live_${'a'.repeat(40)}`

describe('compatibilité avec l’application', () => {
  it('relit une valeur chiffrée par src/lib/security/crypto.ts', async () => {
    const chiffre = encrypt('jeton-de-rafraichissement-google', ENV.ENCRYPTION_KEY)
    assert.equal(await dechiffrer(chiffre, ENV.ENCRYPTION_KEY), 'jeton-de-rafraichissement-google')
  })

  it('relit avec la clé secondaire ce que la première ne déchiffre pas', async () => {
    const chiffre = encrypt('jeton-relie-en-local', 'cle-du-serveur-local-0123456789abcdefgh')
    await assert.rejects(dechiffrerAvec(chiffre, [ENV.ENCRYPTION_KEY]))
    assert.equal(await dechiffrerAvec(chiffre, [ENV.ENCRYPTION_KEY, 'cle-du-serveur-local-0123456789abcdefgh']), 'jeton-relie-en-local')
    assert.equal(await dechiffrerAvec(encrypt('ok', ENV.ENCRYPTION_KEY), [ENV.ENCRYPTION_KEY, undefined]), 'ok')
  })

  it('calcule la même empreinte de clé API', async () => {
    assert.equal(await empreinte(CLE, ENV.API_SECRET), hashSecret(CLE, ENV.API_SECRET))
  })

  it('reprend la DATABASE_URL de Prisma sans ses paramètres propres', () => {
    const adresse = adressePostgres('postgresql://u:p@hote.exemple:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require')
    assert.equal(adresse, 'postgresql://u:p@hote.exemple:6543/postgres?sslmode=require')
  })
})

const LECTURE: Lecture = {
  fichier: 'f1',
  fournisseur: 'p1',
  genre: 'drive',
  objet: 'drive-123',
  taille: 1000,
  type: 'audio/mpeg',
  nom: 'Titre été.mp3',
  telechargement: false,
  origines: ['https://moziik.exemple'],
  expire: Date.now() + 60_000,
}

describe('jetons de lecture', () => {
  it('se relisent, et ne disent rien du fichier en clair', async () => {
    const jeton = await chiffrerLecture(LECTURE, ENV.ENCRYPTION_KEY)
    assert.ok(!jeton.includes('drive'))
    assert.deepEqual(await lireLecture(jeton, ENV.ENCRYPTION_KEY), LECTURE)
  })

  it('refuse un jeton altéré, expiré ou chiffré avec une autre clé', async () => {
    const jeton = await chiffrerLecture(LECTURE, ENV.ENCRYPTION_KEY)
    const altere = jeton.slice(0, -2) + (jeton.endsWith('A') ? 'BB' : 'AA')
    assert.equal(await lireLecture(altere, ENV.ENCRYPTION_KEY), null)
    assert.equal(await lireLecture(jeton, 'une-autre-cle-de-chiffrement-0123456789'), null)
    assert.equal(await lireLecture(await chiffrerLecture({ ...LECTURE, expire: Date.now() - 1 }, ENV.ENCRYPTION_KEY), ENV.ENCRYPTION_KEY), null)
  })
})

/** Une base en mémoire et un faux réseau (Google et l'application). */
function banc(options: { permissions?: string[]; actif?: boolean; type?: string } = {}) {
  const appels: { url: string; init?: RequestInit }[] = []
  const comptes: string[] = []
  let fermetures = 0
  const cle: CleApi = {
    id: 'k1',
    revoquee: false,
    expire: null,
    permissions: options.permissions ?? ['links:create', 'stream:read'],
    projet: { id: 'prj1', publicId: 'prj_moziik', origines: ['https://moziik.exemple'] },
  }
  const fichier: Fichier = { id: 'f1', fournisseur: 'p1', objet: 'drive-123', type: 'audio/mpeg', nom: 'Titre.mp3', taille: 1000 }
  const base = async (): Promise<Base> => ({
    cleApi: async (h) => (h === (await empreinte(CLE, ENV.API_SECRET)) ? cle : null),
    fichier: async (projet, id) => (projet === 'prj1' && id === 'file_abc' ? fichier : null),
    infosFichier: async (projet, id) =>
      projet === 'prj1' && id === 'file_abc'
        ? {
            id: 'file_abc',
            name: 'Pochette.jpg',
            extension: 'jpg',
            mimeType: 'image/jpeg',
            size: 1000,
            checksum: null,
            folderId: 'fld_images',
            status: 'active',
            durationSeconds: null,
            width: 600,
            height: 600,
            createdAt: '2026-10-20T10:00:00.000Z',
            updatedAt: '2026-10-20T10:00:00.000Z',
          }
        : null,
    dossiersRacine: async () => [{ id: 'fld_songs', name: 'songs', createdAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-20T10:00:00.000Z' }],
    fichierActif: async () => options.actif ?? true,
    compterOuverture: async (id) => void comptes.push(id),
    fournisseur: async () =>
      options.type === 'S3'
        ? {
            type: 'S3',
            identifiants: encrypt(JSON.stringify({ accessKeyId: 'AKIAESSAI', secretAccessKey: 'secret-s3' }), ENV.ENCRYPTION_KEY),
            config: { endpoint: 'https://s3.exemple', bucket: 'moziik', region: 'auto' },
          }
        : { type: options.type ?? 'GOOGLE_DRIVE', identifiants: encrypt('rafraichissement', ENV.ENCRYPTION_KEY), config: null },
    fermer: async () => void (fermetures += 1),
  })
  const recuperer = (async (entree: RequestInfo | URL, init?: RequestInit) => {
    // aws4fetch passe une Request déjà signée ; les autres appels, une adresse et des options.
    const url = entree instanceof Request ? entree.url : String(entree)
    if (entree instanceof Request) init = { headers: entree.headers, method: entree.method }
    appels.push({ url, init })
    if (url.startsWith('https://s3.exemple/moziik/')) {
      const plage = new Headers(init?.headers).get('range')
      return new Response('y'.repeat(plage ? 100 : 1000), { status: plage ? 206 : 200 })
    }
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'acces-1', expires_in: 3600 })
    if (url.startsWith('https://www.googleapis.com/drive/v3/files/drive-123')) {
      const plage = new Headers(init?.headers).get('range')
      return new Response('x'.repeat(plage ? 100 : 1000), { status: plage ? 206 : 200 })
    }
    return new Response('relayé', { status: 299 })
  }) as typeof fetch
  // La base est construite de façon asynchrone dans le banc, mais le Worker l'attend synchrone.
  let instance: Base | null = null
  const lecteur = creerLecteur({
    base: () => {
      if (!instance) throw new Error('base non prête')
      return instance
    },
    recuperer,
  })
  const taches: Promise<unknown>[] = []
  const ctx = { waitUntil: (p: Promise<unknown>) => void taches.push(p), passThroughOnException: () => undefined, props: {} } as unknown as ExecutionContext
  return {
    appels,
    comptes,
    fermetures: () => fermetures,
    pret: async () => void (instance = await base()),
    async requete(chemin: string, init?: RequestInit) {
      const r = await lecteur.fetch(new Request(`https://lecture.exemple${chemin}`, init), ENV, ctx)
      await Promise.all(taches)
      return r
    },
  }
}

const demander = (corps: unknown, cle = CLE) => ({
  method: 'POST',
  headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(corps),
})

describe('Worker de lecture', () => {
  beforeEach(() => oublierJetons())

  it('signe un lien vers lui-même, puis sert le titre par plages depuis Drive', async () => {
    const b = banc()
    await b.pret()
    const r = await b.requete('/api/v1/files/file_abc/signed-url', demander({ type: 'stream', expiresIn: 21600 }))
    assert.equal(r.status, 201)
    const { url, expiresAt } = (await r.json()) as { url: string; expiresAt: string }
    assert.match(url, /^https:\/\/lecture\.exemple\/l\//)
    assert.ok(new Date(expiresAt).getTime() > Date.now() + 21_000_000)
    const chemin = new URL(url).pathname

    const premiere = await b.requete(chemin, { headers: { Range: 'bytes=0-99', Origin: 'https://moziik.exemple' } })
    assert.equal(premiere.status, 206)
    assert.equal(premiere.headers.get('content-range'), 'bytes 0-99/1000')
    assert.equal(premiere.headers.get('content-type'), 'audio/mpeg')
    assert.equal(premiere.headers.get('access-control-allow-origin'), 'https://moziik.exemple')
    assert.equal((await premiere.text()).length, 100)
    // L'ouverture compte l'écoute ; la plage suivante ne touche pas la base.
    assert.deepEqual(b.comptes, ['f1'])
    await b.requete(chemin, { headers: { Range: 'bytes=500-599' } })
    assert.deepEqual(b.comptes, ['f1'])

    const versDrive = b.appels.filter((a) => a.url.includes('/drive/v3/'))
    assert.equal(versDrive.length, 2)
    assert.equal(new Headers(versDrive[1]!.init?.headers).get('range'), 'bytes=500-599')
    assert.equal(new Headers(versDrive[0]!.init?.headers).get('authorization'), 'Bearer acces-1')
    // Le jeton d'accès Google est gardé entre deux requêtes.
    assert.equal(b.appels.filter((a) => a.url.includes('oauth2')).length, 1)
    assert.ok(b.fermetures() >= 1)
  })

  it('répond à HEAD sans lire Drive, et refuse une plage hors du fichier', async () => {
    const b = banc()
    await b.pret()
    const { url } = (await (await b.requete('/api/v1/files/file_abc/signed-url', demander({}))).json()) as { url: string }
    const tete = await b.requete(new URL(url).pathname, { method: 'HEAD' })
    assert.equal(tete.status, 200)
    assert.equal(tete.headers.get('content-length'), '1000')
    assert.equal(b.appels.length, 0)
    assert.equal((await b.requete(new URL(url).pathname, { headers: { Range: 'bytes=5000-' } })).status, 416)
  })

  it('ne sert plus un fichier retiré, même avec un lien encore valable', async () => {
    const b = banc({ actif: false })
    await b.pret()
    const { url } = (await (await b.requete('/api/v1/files/file_abc/signed-url', demander({}))).json()) as { url: string }
    assert.equal((await b.requete(new URL(url).pathname)).status, 404)
  })

  it('refuse une clé inconnue, une permission manquante et un fichier inconnu', async () => {
    const b = banc({ permissions: ['links:create'] })
    await b.pret()
    assert.equal((await b.requete('/api/v1/files/file_abc/signed-url', demander({}, `ks_live_${'b'.repeat(40)}`))).status, 401)
    assert.equal((await b.requete('/api/v1/files/file_abc/signed-url', demander({}))).status, 403)
    const b2 = banc()
    await b2.pret()
    assert.equal((await b2.requete('/api/v1/files/file_zzz/signed-url', demander({}))).status, 404)
    assert.equal((await b2.requete('/l/pas-un-jeton')).status, 404)
  })

  it('donne les informations d’un fichier et les dossiers racine, sans passer par l’application', async () => {
    const b = banc({ permissions: ['files:read', 'folders:read'] })
    await b.pret()
    const lire = (chemin: string) => b.requete(chemin, { headers: { Authorization: `Bearer ${CLE}` } })
    const r = await lire('/api/v1/files/file_abc')
    assert.equal(r.status, 200)
    assert.deepEqual(((await r.json()) as { file: { mimeType: string; folderId: string; status: string } }).file, {
      id: 'file_abc',
      name: 'Pochette.jpg',
      extension: 'jpg',
      mimeType: 'image/jpeg',
      size: 1000,
      checksum: null,
      folderId: 'fld_images',
      status: 'active',
      durationSeconds: null,
      width: 600,
      height: 600,
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
    })
    assert.equal((await lire('/api/v1/files/file_zzz')).status, 404)
    const d = (await (await lire('/api/v1/folders')).json()) as { folders: { id: string; name: string; parentId: null }[] }
    assert.deepEqual(d.folders.map((x) => [x.id, x.name, x.parentId]), [['fld_songs', 'songs', null]])
    assert.equal(b.appels.length, 0)
    // Sans la permission, refus ; sans clé, refus.
    const sansDroit = banc()
    await sansDroit.pret()
    assert.equal((await sansDroit.requete('/api/v1/files/file_abc', { headers: { Authorization: `Bearer ${CLE}` } })).status, 403)
    assert.equal((await b.requete('/api/v1/folders')).status, 401)
  })

  it('sert aussi un fichier rangé chez un fournisseur S3, signé comme par l’application', async () => {
    const b = banc({ type: 'S3' })
    await b.pret()
    const { url } = (await (await b.requete('/api/v1/files/file_abc/signed-url', demander({}))).json()) as { url: string }
    const r = await b.requete(new URL(url).pathname, { headers: { Range: 'bytes=0-99' } })
    assert.equal(r.status, 206)
    assert.equal(await r.text(), 'y'.repeat(100))
    const versS3 = b.appels.filter((a) => a.url.startsWith('https://s3.exemple/'))
    assert.equal(versS3.length, 1)
    assert.equal(versS3[0]!.url, 'https://s3.exemple/moziik/drive-123')
    const entetes = new Headers(versS3[0]!.init?.headers)
    assert.equal(entetes.get('range'), 'bytes=0-99')
    assert.match(entetes.get('authorization') ?? '', /^AWS4-HMAC-SHA256 Credential=AKIAESSAI\//)
  })

  it('relaie à l’application le reste : autres routes, liens à usage compté, autres fournisseurs', async () => {
    const b = banc()
    await b.pret()
    const sousDossiers = await b.requete('/api/v1/folders?parentId=fld_1')
    assert.equal(sousDossiers.status, 299)
    assert.equal(b.appels.at(-1)!.url, 'https://stockage.exemple/api/v1/folders?parentId=fld_1')
    assert.equal((await b.requete('/api/v1/folders', demander({ name: 'images' }))).status, 299)
    assert.equal((await b.requete('/api/v1/files/file_abc/signed-url', demander({ maxUses: 1 }))).status, 299)
    const local = banc({ type: 'LOCAL' })
    await local.pret()
    assert.equal((await local.requete('/api/v1/files/file_abc/signed-url', demander({}))).status, 299)
  })
})
