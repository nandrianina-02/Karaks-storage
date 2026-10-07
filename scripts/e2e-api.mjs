/**
 * Critères d'acceptation (CDS 39), de bout en bout, contre un serveur lancé.
 *
 * Travaille dans un projet dédié, « Projet de test e2e », et efface à la fin
 * les fichiers qu'il a créés. Ne touche à aucun autre projet.
 *
 * Usage : node scripts/e2e-api.mjs
 *   BASE_URL (défaut http://localhost:3200), ADMIN_EMAIL, ADMIN_PASSWORD,
 *   E2E_PROJECT : nom du projet de test. Un projet créé après la connexion
 *   de Google Drive y est stocké : « Projet de test Drive » éprouve alors le
 *   vrai fournisseur.
 */
import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'

import { melody } from './lib/media.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3200'
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@karaks-storage.local'
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'ks-admin-dev-2026'
const ORIGIN_OK = 'http://localhost:3000'
const PROJECT_NAME = process.env.E2E_PROJECT ?? 'Projet de test e2e'
const PROJECT_SLUG = PROJECT_NAME.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')

const failures = []
function check(label, ok, detail = '') {
  console.log(`[${ok ? 'OK  ' : 'ECHEC'}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

let cookie = ''
async function request(path, { method = 'GET', body, headers = {}, key, project, session = !key } = {}) {
  const init = { method, headers: { ...headers } }
  if (session) {
    init.headers.Cookie = cookie
    init.headers.Origin ??= BASE
  }
  if (key) init.headers.Authorization = `Bearer ${key}`
  if (project) init.headers['X-Project'] = project
  if (body instanceof FormData || body instanceof Uint8Array) init.body = body
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const response = await fetch(`${BASE}${path}`, init)
  const setCookie = response.headers.getSetCookie?.() ?? []
  if (setCookie.length) cookie = setCookie.map((value) => value.split(';')[0]).join('; ')
  const type = response.headers.get('content-type') ?? ''
  const data = type.includes('json') ? await response.json() : new Uint8Array(await response.arrayBuffer())
  return { status: response.status, headers: response.headers, data }
}

// --- Récepteur de webhooks, pour vérifier la signature ---
const received = []
const receiver = createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    received.push({ headers: req.headers, body })
    res.writeHead(204).end()
  })
})
await new Promise((resolve) => receiver.listen(4799, resolve))

// --- Compte et projet ---
const signIn = await request('/api/v1/auth/sign-in/email', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })
check('un administrateur se connecte au tableau de bord', signIn.status === 200, String(signIn.status))

const anonymous = await request('/api/v1/files', { session: false })
check('sans authentification, l’API refuse (401)', anonymous.status === 401, String(anonymous.status))

const { data: listed } = await request('/api/v1/projects')
let project = listed.projects.find((item) => item.slug.startsWith(PROJECT_SLUG))
if (!project) {
  const created = await request('/api/v1/projects', {
    method: 'POST',
    body: { name: PROJECT_NAME, allowedOrigins: [ORIGIN_OK] },
  })
  check('un administrateur peut créer un projet', created.status === 201, String(created.status))
  project = created.data.project
} else {
  check('un administrateur peut créer un projet', true, 'projet de test déjà présent')
}
const P = project.id
await request(`/api/v1/projects/${P}`, { method: 'PATCH', body: { allowedOrigins: [ORIGIN_OK], rateLimitPerMinute: 100 } })

const csrf = await request('/api/v1/folders', { method: 'POST', project: P, body: { name: 'x' }, headers: { Origin: 'https://site-tiers.example' } })
check('une écriture par cookie depuis un autre site est refusée (CSRF)', csrf.status === 403, String(csrf.status))

// --- Clé API aux permissions limitées ---
const keyResponse = await request('/api/v1/api-keys', {
  method: 'POST',
  project: P,
  body: {
    name: 'Clé e2e',
    permissions: ['files:read', 'files:upload', 'folders:read', 'folders:write', 'stream:read', 'download:read', 'links:create'],
  },
})
const KEY = keyResponse.data.secret
check('une clé API se crée et n’est montrée qu’à la création', keyResponse.status === 201 && /^ks_(live|test)_/.test(KEY ?? ''), keyResponse.data.apiKey?.prefix)
const keyList = await request('/api/v1/api-keys', { project: P })
check('la liste des clés ne contient jamais le secret', !JSON.stringify(keyList.data).includes(KEY))

// --- Dossier et envoi simple ---
const folderName = `audio-${Date.now().toString(36)}`
const folder = await request('/api/v1/folders', { method: 'POST', key: KEY, body: { name: folderName } })
check('un dossier se crée par l’API', folder.status === 201, folder.data.folder?.id)
const FOLDER = folder.data.folder.id

const wav = melody(6, 4)
const form = new FormData()
form.append('file', new Blob([wav], { type: 'audio/wav' }), 'essai-e2e.wav')
form.append('folderId', FOLDER)
form.append('durationSeconds', '6')
const simple = await request('/api/v1/files/upload', { method: 'POST', key: KEY, body: form })
check('un fichier s’envoie par l’API (envoi simple)', simple.status === 201, simple.data.file?.id)
const FILE = simple.data.file.id

const fake = new FormData()
const exe = new Uint8Array(4096)
exe.set([0x4d, 0x5a, 0x90, 0x00])
fake.append('file', new Blob([exe], { type: 'audio/mpeg' }), 'chanson.mp3')
const refused = await request('/api/v1/files/upload', { method: 'POST', key: KEY, body: fake })
check('un exécutable renommé en .mp3 est refusé (415)', refused.status === 415, refused.data.error?.message)

const badExt = new FormData()
badExt.append('file', new Blob([wav]), 'script.exe')
const refusedExt = await request('/api/v1/files/upload', { method: 'POST', key: KEY, body: badExt })
check('une extension non acceptée est refusée', refusedExt.status === 415, String(refusedExt.status))

// --- Envoi reprenable, avec interruption simulée ---
const big = melody(14, 5)
const opened = await request('/api/v1/uploads', {
  method: 'POST',
  key: KEY,
  body: { name: 'reprise-e2e.wav', mimeType: 'audio/wav', size: big.length, folderId: FOLDER },
})
const UPLOAD = opened.data.upload?.id
check('une session reprenable s’ouvre', opened.status === 201, UPLOAD)
const piece = 256 * 1024
const put = (start, end) =>
  request(`/api/v1/uploads/${UPLOAD}`, {
    method: 'PUT',
    key: KEY,
    headers: { 'Content-Range': `bytes ${start}-${end}/${big.length}` },
    body: big.subarray(start, end + 1),
  })
const first = await put(0, piece - 1)
check('le premier morceau est reçu (202)', first.status === 202 && first.data.upload.received === piece, String(first.data.upload?.received))
const replay = await put(0, piece - 1)
check('un morceau rejoué n’est pas ajouté deux fois', replay.data.upload.received === piece, String(replay.data.upload?.received))
const status = await request(`/api/v1/uploads/${UPLOAD}`, { key: KEY })
check('après coupure, le service indique où reprendre', status.data.upload.received === piece, String(status.data.upload?.received))
const odd = await put(piece, piece + 1000)
check('un morceau intermédiaire hors granularité est refusé', odd.status === 400, String(odd.status))
let cursor = piece
let resumable = null
while (cursor < big.length) {
  const end = Math.min(cursor + piece * 2, big.length) - 1
  const result = await put(cursor, end)
  cursor = result.data.upload.received
  resumable = result.data.file
}
check('l’envoi reprenable aboutit au fichier complet', resumable?.size === big.length, resumable?.id)

// --- Envoi direct depuis un navigateur (adresse à jeton) ---
const directData = melody(3, 7)
const direct = await request('/api/v1/uploads', {
  method: 'POST',
  key: KEY,
  body: { name: 'direct-e2e.wav', mimeType: 'audio/wav', size: directData.length, folderId: FOLDER },
})
const uploadUrl = new URL(direct.data.uploadUrl ?? `${BASE}/u/x?t=x`)
check('l’ouverture d’envoi renvoie une adresse à jeton', /^\/u\/upl_[0-9A-Za-z]+$/.test(uploadUrl.pathname) && uploadUrl.searchParams.get('t')?.length === 32)
const badToken = await request(`${uploadUrl.pathname}?t=${'x'.repeat(32)}`, { session: false })
check('un jeton d’envoi faux ne mène à rien (404)', badToken.status === 404, String(badToken.status))
const preflight = await fetch(`${BASE}${uploadUrl.pathname}${uploadUrl.search}`, {
  method: 'OPTIONS',
  headers: { Origin: ORIGIN_OK, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-range' },
})
check('le prévol CORS autorise PUT et Content-Range', /PUT/.test(preflight.headers.get('access-control-allow-methods') ?? '') && /Content-Range/i.test(preflight.headers.get('access-control-allow-headers') ?? ''))
let directFile = null
let directCors = null
for (let start = 0; start < directData.length; ) {
  const end = Math.min(start + 256 * 1024, directData.length) - 1
  const part = await request(`${uploadUrl.pathname}${uploadUrl.search}`, {
    method: 'PUT',
    session: false,
    headers: { 'Content-Range': `bytes ${start}-${end}/${directData.length}`, Origin: ORIGIN_OK },
    body: directData.subarray(start, end + 1),
  })
  directCors ??= part.headers.get('access-control-allow-origin')
  start = part.data.upload?.received ?? directData.length
  directFile = part.data.file ?? directFile
}
check('le navigateur envoie le fichier sans clé, par morceaux', directFile?.size === directData.length, directFile?.id)
check('l’origine déclarée reçoit l’autorisation CORS à l’envoi', directCors === ORIGIN_OK, directCors)
const replayDirect = await request(`${uploadUrl.pathname}${uploadUrl.search}`, { session: false })
check('l’adresse d’envoi indique le fichier terminé', replayDirect.data.file?.id === directFile?.id)

// --- Liste, recherche, confidentialité ---
const files = await request(`/api/v1/files?folderId=${FOLDER}`, { key: KEY })
check('un client API récupère la liste des fichiers', files.status === 200 && files.data.files.length === 3, `${files.data.files?.length} fichiers`)
const search = await request('/api/v1/files?search=REPRISE', { key: KEY })
check('la recherche ignore la casse', search.data.files.some((file) => file.id === resumable?.id))
const raw = JSON.stringify([simple.data, files.data, search.data])
check('aucun identifiant du fournisseur ne sort par l’API', !/provider|storageName|drive/i.test(raw))

// --- Lecture par plages ---
const ranged = await request(`/api/v1/files/${FILE}/stream`, { key: KEY, headers: { Range: 'bytes=0-999' } })
check(
  'un fichier audio se lit par plage (206)',
  ranged.status === 206 && ranged.data.length === 1000 && ranged.headers.get('content-range') === `bytes 0-999/${wav.length}`,
  ranged.headers.get('content-range'),
)
const seek = await request(`/api/v1/files/${FILE}/stream`, { key: KEY, headers: { Range: `bytes=${wav.length - 100}-` } })
check('l’avance rapide renvoie la fin du fichier', seek.status === 206 && seek.data.length === 100)
const beyond = await request(`/api/v1/files/${FILE}/stream`, { key: KEY, headers: { Range: `bytes=${wav.length + 5}-` } })
check('une plage hors du fichier est refusée (416)', beyond.status === 416)
const download = await request(`/api/v1/files/${FILE}/download`, { key: KEY })
check('le téléchargement est servi en pièce jointe', /attachment/.test(download.headers.get('content-disposition') ?? ''))

// --- Permissions ---
const forbidden = await request(`/api/v1/files/${FILE}`, { method: 'DELETE', key: KEY })
check('une clé sans files:delete ne peut pas supprimer (403)', forbidden.status === 403 && forbidden.data.error.details?.missing?.includes('files:delete'))
const otherProject = await request('/api/v1/files', { key: KEY, project: 'prj_AutreProjet01' })
check('une clé ne sert que son projet', otherProject.status === 403, String(otherProject.status))
const noKeys = await request('/api/v1/api-keys', { key: KEY })
check('une clé ne peut pas gérer les clés', noKeys.status === 403)

// --- Liens temporaires ---
const link = await request(`/api/v1/files/${FILE}/signed-url`, { method: 'POST', key: KEY, body: { type: 'stream', expiresIn: 30, maxUses: 1 } })
check('un lien temporaire se génère', link.status === 201 && /\/s\/[0-9A-Za-z]{24}$/.test(link.data.url ?? ''), link.data.url)
const LINK = new URL(link.data.url).pathname
const open = await request(LINK, { session: false, headers: { Range: 'bytes=0-499', Origin: ORIGIN_OK } })
check('le lien se lit sans clé', open.status === 206 && open.data.length === 500)
check('l’origine autorisée reçoit les en-têtes CORS', open.headers.get('access-control-allow-origin') === ORIGIN_OK, open.headers.get('access-control-allow-origin'))
check('Content-Range est exposé au script', /Content-Range/.test(open.headers.get('access-control-expose-headers') ?? ''))
const plainTag = await request(LINK, { session: false, headers: { Range: 'bytes=10-19' } })
check(
  'une balise audio d’un autre site peut charger le lien (CORP cross-origin)',
  plainTag.headers.get('cross-origin-resource-policy') === 'cross-origin',
  plainTag.headers.get('cross-origin-resource-policy'),
)
const foreign = await request(LINK, { session: false, headers: { Range: 'bytes=0-9', Origin: 'https://site-tiers.example' } })
check('une origine non déclarée ne reçoit pas d’autorisation CORS', !foreign.headers.get('access-control-allow-origin'))
const continued = await request(LINK, { session: false, headers: { Range: 'bytes=500-999' } })
check('la même lecture continue par plages après l’ouverture', continued.status === 206)
const reopened = await request(LINK, { session: false })
check('une seconde ouverture d’un lien à usage unique est refusée (410)', reopened.status === 410, String(reopened.status))
const tampered = await request(`${LINK.slice(0, -1)}${LINK.endsWith('A') ? 'B' : 'A'}`, { session: false })
check('un jeton altéré ne mène à rien (404)', tampered.status === 404)

const revocable = await request(`/api/v1/files/${FILE}/signed-url`, { method: 'POST', key: KEY, body: { type: 'download', expiresIn: 600 } })
const linkId = revocable.data.link.id
const revoke = await request(`/api/v1/links/${linkId}`, { method: 'DELETE', project: P })
check('un lien peut être révoqué', revoke.status === 200 && revoke.data.link.status === 'revoked')
const afterRevoke = await request(new URL(revocable.data.url).pathname, { session: false })
check('un lien révoqué est refusé (410)', afterRevoke.status === 410)

const expiring = await request(`/api/v1/files/${FILE}/signed-url`, { method: 'POST', key: KEY, body: { type: 'stream', expiresIn: 30 } })
const expiringPath = new URL(expiring.data.url).pathname
const before = await request(expiringPath, { session: false, headers: { Range: 'bytes=0-9' } })
console.log('       attente de l’expiration du lien (31 s)...')
await new Promise((resolve) => setTimeout(resolve, 31_000))
const after = await request(expiringPath, { session: false, headers: { Range: 'bytes=0-9' } })
check('le lien expire automatiquement', before.status === 206 && after.status === 410, `${before.status} puis ${after.status}`)

// --- Webhooks signés ---
const hook = await request('/api/v1/webhooks', {
  method: 'POST',
  project: P,
  body: { url: 'http://localhost:4799/hook', events: ['file.uploaded', 'file.deleted'] },
})
const SECRET = hook.data.secret
// En production, les webhooks vers le réseau local sont refusés (SSRF) : le
// récepteur de ce scénario n'y est pas joignable, l'essai est alors sauté.
const webhookTestable = hook.status === 201
if (!webhookTestable) console.log('       webhook vers localhost refusé (serveur de production) : essai sauté')
const tiny = new FormData()
tiny.append('file', new Blob([new TextEncoder().encode('webhook e2e\n')], { type: 'text/plain' }), 'webhook-e2e.txt')
const tinyFile = await request('/api/v1/files/upload', { method: 'POST', key: KEY, body: tiny })
for (let i = 0; webhookTestable && i < 30 && !received.some((item) => item.body.includes(tinyFile.data.file.id)); i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 200))
}
const delivery = received.find((item) => item.body.includes(tinyFile.data.file.id))
const [, t, v1] = /t=(\d+),v1=([0-9a-f]+)/.exec(delivery?.headers['karaks-signature'] ?? '') ?? []
const expected = delivery ? createHmac('sha256', SECRET).update(`${t}.${delivery.body}`).digest('hex') : ''
if (webhookTestable) check('le webhook file.uploaded arrive, signé', Boolean(delivery) && v1 === expected, delivery?.headers['karaks-event'])

// --- Corbeille ---
const trash = await request(`/api/v1/files/${FILE}`, { method: 'DELETE', project: P })
check('un fichier part à la corbeille', trash.data.file?.status === 'trashed')
const trashedStream = await request(`/api/v1/files/${FILE}/stream`, { key: KEY })
check('un fichier à la corbeille n’est plus diffusé', trashedStream.status === 404)
const restore = await request(`/api/v1/files/${FILE}/restore`, { method: 'POST', project: P })
check('un fichier se restaure', restore.data.file?.status === 'active')

// --- Journal d'audit ---
const logs = await request('/api/v1/logs?limit=200', { project: P })
const actions = new Set(logs.data.logs.map((item) => item.action))
const expectedActions = ['UPLOAD', 'STREAM', 'DOWNLOAD', 'CREATE_LINK', 'REVOKE_LINK', 'CREATE_API_KEY', 'DELETE', 'RESTORE', 'CREATE_FOLDER']
const missing = expectedActions.filter((action) => !actions.has(action))
check('les événements importants sont journalisés', missing.length === 0, missing.length ? `manquent : ${missing.join(', ')}` : expectedActions.join(', '))

// --- Révocation de la clé ---
const revokeKey = await request(`/api/v1/api-keys/${keyResponse.data.apiKey.id}`, { method: 'DELETE', project: P })
const afterKey = await request('/api/v1/files', { key: KEY })
check('une clé révoquée est refusée (401)', revokeKey.status === 200 && afterKey.status === 401)

// --- Limitation de débit ---
await request(`/api/v1/projects/${P}`, { method: 'PATCH', body: { rateLimitPerMinute: 10 } })
let limited = null
for (let i = 0; i < 14 && !limited; i += 1) {
  const response = await request('/api/v1/files?limit=1', { project: P })
  if (response.status === 429) limited = response
}
check('au-delà de la limite, l’API répond 429 avec Retry-After', Boolean(limited?.headers.get('retry-after')))
await request(`/api/v1/projects/${P}`, { method: 'PATCH', body: { rateLimitPerMinute: 100 } })

// --- Suppression d'un projet ---
// Sur un projet jetable : le projet de test, lui, sert aux passages suivants.
const doomed = (await request('/api/v1/projects', { method: 'POST', body: { name: `Projet jetable ${Date.now().toString(36)}` } })).data.project
const doomedKey = (
  await request('/api/v1/api-keys', { method: 'POST', project: doomed.id, body: { name: 'Clé jetable', permissions: ['files:read', 'files:upload'] } })
).data.secret
const doomedForm = new FormData()
doomedForm.append('file', new Blob([melody(2, 6)], { type: 'audio/wav' }), 'jetable.wav')
const doomedFile = (await request('/api/v1/files/upload', { method: 'POST', key: doomedKey, body: doomedForm })).data.file
const doomedTrash = new FormData()
doomedTrash.append('file', new Blob([new TextEncoder().encode('corbeille\n')], { type: 'text/plain' }), 'corbeille.txt')
const trashedFile = (await request('/api/v1/files/upload', { method: 'POST', key: doomedKey, body: doomedTrash })).data.file
await request(`/api/v1/files/${trashedFile.id}`, { method: 'DELETE', project: doomed.id })

const byKey = await request(`/api/v1/projects/${doomed.id}`, { method: 'DELETE', key: doomedKey, body: { confirm: doomed.name } })
check('une clé API ne peut pas supprimer un projet', byKey.status === 403, String(byKey.status))
const wrongName = await request(`/api/v1/projects/${doomed.id}`, { method: 'DELETE', body: { confirm: 'autre nom' } })
check('la suppression exige de retaper le nom du projet', wrongName.status === 400, String(wrongName.status))
const deleted = await request(`/api/v1/projects/${doomed.id}`, { method: 'DELETE', body: { confirm: doomed.name } })
check(
  'un projet se supprime avec ses fichiers, corbeille comprise',
  deleted.status === 200 && deleted.data.deleted?.files === 2,
  `${deleted.data.deleted?.files} fichiers`,
)
const stillListed = (await request('/api/v1/projects')).data.projects.some((item) => item.id === doomed.id)
check('le projet supprimé disparaît de la liste', !stillListed)
const orphanKey = await request('/api/v1/files', { key: doomedKey })
check('les clés du projet supprimé sont refusées', orphanKey.status === 401, String(orphanKey.status))
const gone = await request(`/api/v1/files/${doomedFile.id}`, { project: doomed.id })
check('ses fichiers ne sont plus accessibles', gone.status === 404, String(gone.status))
const deletionLog = await request('/api/v1/me/notifications')
check(
  'la suppression reste inscrite au journal',
  deletionLog.data.items?.some((item) => item.action === 'DELETE_PROJECT' && item.target === doomed.name),
)

// --- Ménage ---
for (const id of [FILE, resumable?.id, tinyFile.data.file?.id, directFile?.id].filter(Boolean)) {
  await request(`/api/v1/files/${id}/permanent`, { method: 'DELETE', project: P })
}
await request(`/api/v1/folders/${FOLDER}`, { method: 'DELETE', project: P })
if (webhookTestable) await request(`/api/v1/webhooks/${hook.data.webhook.id}`, { method: 'DELETE', project: P })
receiver.close()

console.log(failures.length === 0 ? '\nToutes les vérifications sont passées.' : `\n${failures.length} échec(s) : ${failures.join(' | ')}`)
process.exit(failures.length === 0 ? 0 : 1)
