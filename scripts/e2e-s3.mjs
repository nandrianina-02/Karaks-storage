/**
 * Stockage compatible S3, de bout en bout, contre un service S3 local :
 * connexion, envois simple et reprenable, lecture par plage, diffusion
 * directe par redirection, puis changement de stockage d'un projet dans les
 * deux sens, sans perte d'octet.
 *
 * s3rver ne contrôle pas les signatures v4 : seul un vrai service (R2, S3)
 * valide la signature elle-même.
 *
 * Le scénario crée son propre projet et le supprime à la fin ; il remet en
 * place le fournisseur des nouveaux projets. Base locale seulement.
 *
 * Usage : S3_ENDPOINT=http://127.0.0.1:4569 S3_BUCKET=karaks-test \
 *         S3_KEY=… S3_SECRET=… node scripts/e2e-s3.mjs   (serveur lancé)
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import pg from 'pg'

import { melody } from './lib/media.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3200'
const S3 = {
  endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:4569',
  bucket: process.env.S3_BUCKET ?? 'karaks-test',
  accessKeyId: process.env.S3_KEY ?? 'ESSAIKARAKS01',
  secretAccessKey: process.env.S3_SECRET ?? 'essai-secret-karaks-storage-2026',
}
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
)
if (!['localhost', '127.0.0.1'].includes(new URL(env.DATABASE_URL).hostname)) {
  console.error('Ce scénario modifie les fournisseurs : il ne tourne que sur la base locale.')
  process.exit(1)
}

const failures = []
function check(label, ok, detail = '') {
  console.log(`[${ok ? 'OK  ' : 'ECHEC'}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

let cookie = ''
async function request(path, { method = 'GET', body, headers = {}, project, redirect = 'follow' } = {}) {
  const init = { method, headers: { Origin: BASE, Cookie: cookie, ...headers }, redirect }
  if (project) init.headers['X-Project'] = project
  if (body instanceof FormData || body instanceof Uint8Array) init.body = body
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const response = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, init)
  const set = response.headers.getSetCookie?.() ?? []
  if (set.length) cookie = set.map((value) => value.split(';')[0]).join('; ')
  const type = response.headers.get('content-type') ?? ''
  const data = type.includes('json') ? await response.json() : new Uint8Array(await response.arrayBuffer())
  return { status: response.status, headers: response.headers, data }
}

const db = new pg.Client({ connectionString: env.DATABASE_URL })
await db.connect()
const defaults = (await db.query('SELECT id FROM storage_providers WHERE "isDefault"')).rows.map((row) => row.id)
const local = (await db.query(`SELECT id FROM storage_providers WHERE kind = 'LOCAL'`)).rows[0]
if (!local) {
  console.error('Il faut un fournisseur « disque local » en base pour tester la migration.')
  process.exit(1)
}

let projectId = null
let projectName = null
let providerId = null
try {
  await request('/api/v1/auth/sign-in/email', { method: 'POST', body: { email: process.env.ADMIN_EMAIL ?? 'admin@karaks-storage.local', password: process.env.ADMIN_PASSWORD ?? 'ks-admin-dev-2026' } })

  // --- Connexion ---
  // Identifiant inconnu plutôt que secret faux : s3rver ne vérifie pas les
  // signatures v4, il ne refuserait pas un secret erroné. R2 et S3, si.
  const wrong = await request('/api/v1/storage/s3', { method: 'POST', body: { name: 'Essai S3', ...S3, accessKeyId: 'CLEINCONNUE99', region: 'us-east-1' } })
  check('une clé fausse est refusée avant tout enregistrement', wrong.status === 400, wrong.data.error?.message)
  const connected = await request('/api/v1/storage/s3', { method: 'POST', body: { name: 'Essai S3', ...S3, region: 'us-east-1', redirect: true } })
  providerId = connected.data.provider?.id
  check('le compartiment se relie', connected.status === 201, providerId)
  const stored = (await db.query('SELECT credentials, config FROM storage_providers WHERE id = $1', [providerId])).rows[0]
  check('la clé secrète est chiffrée en base', !stored.credentials.includes(S3.secretAccessKey) && !JSON.stringify(stored.config).includes(S3.secretAccessKey))
  const asDefault = await request(`/api/v1/storage/${providerId}`, { method: 'PATCH', body: { isDefault: true } })
  check('il devient le stockage des nouveaux projets', asDefault.status === 200)

  // --- Projet sur S3 ---
  projectName = `Essai S3 ${Date.now().toString(36)}`
  const created = await request('/api/v1/projects', { method: 'POST', body: { name: projectName } })
  projectId = created.data.project?.id
  const kind = (await db.query('SELECT sp.kind FROM projects p JOIN storage_providers sp ON sp.id = p."providerId" WHERE p."publicId" = $1', [projectId])).rows[0]?.kind
  check('un nouveau projet part sur S3', created.status === 201 && kind === 'S3', kind)

  const small = melody(3, 2)
  const form = new FormData()
  form.append('file', new Blob([small], { type: 'audio/wav' }), 'petit.wav')
  const simple = await request('/api/v1/files/upload', { method: 'POST', body: form, project: projectId })
  const SMALL = simple.data.file?.id
  check('un envoi simple arrive dans le compartiment', simple.status === 201, SMALL)
  const range = await request(`/api/v1/files/${SMALL}/stream`, { project: projectId, headers: { Range: 'bytes=100-1099' } })
  check('la lecture par plage renvoie les bons octets', range.status === 206 && sha(range.data) === sha(small.subarray(100, 1100)))

  // Envoi reprenable par morceaux de 4 Mio : les parties S3 doivent faire 8 Mio.
  const big = melody(300, 5)
  const opened = await request('/api/v1/uploads', { method: 'POST', project: projectId, body: { name: 'grand.wav', mimeType: 'audio/wav', size: big.length } })
  const UPLOAD = opened.data.upload?.id
  const CHUNK = 4 * 1024 * 1024
  let cursor = 0
  let bigFile = null
  while (cursor < big.length) {
    const end = Math.min(cursor + CHUNK, big.length) - 1
    const put = await request(`/api/v1/uploads/${UPLOAD}`, {
      method: 'PUT',
      project: projectId,
      headers: { 'Content-Range': `bytes ${cursor}-${end}/${big.length}` },
      body: big.subarray(cursor, end + 1),
    })
    if (put.status >= 400) throw new Error(`Envoi refusé : ${JSON.stringify(put.data)}`)
    cursor = put.data.upload.received
    bigFile = put.data.file
  }
  const BIG = bigFile?.id
  check(`un envoi reprenable de ${(big.length / 1048576).toFixed(1)} Mio aboutit`, bigFile?.size === big.length, BIG)
  const whole = await request(`/api/v1/files/${BIG}/download`, { project: projectId })
  check('le fichier relu est identique, octet pour octet', sha(whole.data) === sha(big))

  // --- Diffusion directe ---
  const link = await request(`/api/v1/files/${BIG}/signed-url`, { method: 'POST', project: projectId, body: { type: 'stream', expiresIn: 600 } })
  const LINK = new URL(link.data.url).pathname
  const redirected = await request(LINK, { redirect: 'manual' })
  const location = redirected.headers.get('location') ?? ''
  check('un lien temporaire redirige vers une adresse signée du compartiment', redirected.status === 302 && location.startsWith(S3.endpoint) && location.includes('X-Amz-Signature'))
  const directRead = await fetch(location, { headers: { Range: 'bytes=0-65535' } })
  const directBytes = new Uint8Array(await directRead.arrayBuffer())
  check('le navigateur lit directement chez le fournisseur', directRead.status === 206 && sha(directBytes) === sha(big.subarray(0, 65536)), String(directRead.status))
  await request(`/api/v1/storage/${providerId}`, { method: 'PATCH', body: { redirect: false } })
  const proxied = await request(LINK, { redirect: 'manual', headers: { Range: 'bytes=0-999' } })
  check('sans diffusion directe, le lien sert les octets lui-même', proxied.status === 206 && sha(proxied.data) === sha(big.subarray(0, 1000)), String(proxied.status))

  // --- Corbeille ---
  const trashed = await request(`/api/v1/files/${SMALL}`, { method: 'DELETE', project: projectId })
  const restored = await request(`/api/v1/files/${SMALL}/restore`, { method: 'POST', project: projectId })
  check('corbeille et restauration fonctionnent sans dossiers chez S3', trashed.status === 200 && restored.status === 200)

  // --- Changement de stockage, aller et retour ---
  async function migrate(target, label) {
    const started = await request(`/api/v1/projects/${projectId}/migration`, { method: 'POST', body: { providerId: target } })
    let migration = started.data.migration
    check(`la migration vers ${label} démarre`, started.status === 201, `${migration?.totalFiles} fichiers`)
    // Le projet reste lisible pendant la copie.
    const during = await request(`/api/v1/files/${BIG}/stream`, { project: projectId, headers: { Range: 'bytes=0-999' } })
    check(`pendant la copie vers ${label}, le fichier reste lisible`, during.status === 206 && sha(during.data) === sha(big.subarray(0, 1000)))
    for (let turn = 0; turn < 20 && migration?.status === 'RUNNING'; turn += 1) {
      migration = (await request(`/api/v1/migrations/${migration.id}/step`, { method: 'POST' })).data.migration
    }
    const remaining = (await db.query('SELECT count(*)::int AS n FROM files f JOIN projects p ON p.id = f."projectId" WHERE p."publicId" = $1 AND f."providerId" <> $2', [projectId, target])).rows[0].n
    check(`la migration vers ${label} se termine, tous fichiers déplacés`, migration?.status === 'DONE' && remaining === 0, `${migration?.movedFiles}/${migration?.totalFiles}, ${migration?.error ?? 'sans erreur'}`)
    const after = await request(`/api/v1/files/${BIG}/download`, { project: projectId })
    check(`après la migration vers ${label}, le fichier est intact`, sha(after.data) === sha(big))
  }
  await migrate(local.id, 'le disque local')
  await migrate(providerId, 'S3')

  const busy = await request(`/api/v1/storage/${providerId}`, { method: 'DELETE' })
  check('un stockage qui porte un projet ne se retire pas', busy.status === 409, String(busy.status))
} finally {
  // --- Remise en état ---
  if (projectId) await request(`/api/v1/projects/${projectId}`, { method: 'DELETE', body: { confirm: projectName } })
  await db.query('UPDATE storage_providers SET "isDefault" = (id = ANY($1))', [defaults])
  if (providerId) {
    const removed = await request(`/api/v1/storage/${providerId}`, { method: 'DELETE' })
    check('vidé, le stockage S3 se retire', removed.status === 200, String(removed.status))
  }
  await db.end()
}

console.log(failures.length === 0 ? '\nToutes les vérifications sont passées.' : `\n${failures.length} échec(s) : ${failures.join(' | ')}`)
process.exit(failures.length === 0 ? 0 : 1)
