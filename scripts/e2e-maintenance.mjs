/**
 * Maintenance automatique, de bout en bout, sur la base locale.
 *
 * Le temps ne s'accélère pas : le scénario vieillit lui-même les données
 * (date de mise à la corbeille, expiration d'un envoi, échéance d'une relance
 * de webhook) directement en base, puis appelle la tâche planifiée comme le
 * ferait Vercel. Réservé au développement : il refuse une base distante.
 *
 * Usage : node scripts/e2e-maintenance.mjs  (serveur lancé, CRON_SECRET dans .env)
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

import pg from 'pg'

import { melody } from './lib/media.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3200'
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
)
const database = new URL(env.DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(database.hostname)) {
  console.error('Ce scénario modifie des dates en base : il ne tourne que sur la base locale.')
  process.exit(1)
}

const failures = []
function check(label, ok, detail = '') {
  console.log(`[${ok ? 'OK  ' : 'ECHEC'}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

let cookie = ''
async function request(path, { method = 'GET', body, headers = {}, project } = {}) {
  const init = { method, headers: { Origin: BASE, Cookie: cookie, ...headers } }
  if (project) init.headers['X-Project'] = project
  if (body instanceof FormData || body instanceof Uint8Array) init.body = body
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const response = await fetch(`${BASE}${path}`, init)
  const set = response.headers.getSetCookie?.() ?? []
  if (set.length) cookie = set.map((value) => value.split(';')[0]).join('; ')
  return { status: response.status, data: await response.json().catch(() => null) }
}

const db = new pg.Client({ connectionString: env.DATABASE_URL })
await db.connect()

// Récepteur qui refuse tout : l'envoi échoue et doit être relancé.
let hits = 0
const receiver = createServer((req, res) => {
  hits += 1
  req.resume()
  res.writeHead(hits >= 2 ? 204 : 500).end()
})
await new Promise((resolve) => receiver.listen(4798, resolve))

await request('/api/v1/auth/sign-in/email', {
  method: 'POST',
  body: { email: process.env.ADMIN_EMAIL ?? 'admin@karaks-storage.local', password: process.env.ADMIN_PASSWORD ?? 'ks-admin-dev-2026' },
})
const { data: list } = await request('/api/v1/projects')
let project = list.projects.find((item) => item.slug.startsWith('projet-de-maintenance'))
project ??= (await request('/api/v1/projects', { method: 'POST', body: { name: 'Projet de maintenance' } })).data.project
const P = project.id

const settings = await request(`/api/v1/projects/${P}`, { method: 'PATCH', body: { trashRetentionDays: 7 } })
check('la conservation de la corbeille se règle par projet', settings.data?.project?.trashRetentionDays === 7)

// --- Corbeille : un fichier ancien, un fichier récent ---
async function upload(name) {
  const form = new FormData()
  form.append('file', new Blob([melody(1, 3)], { type: 'audio/wav' }), name)
  return (await request('/api/v1/files/upload', { method: 'POST', project: P, body: form })).data.file
}
const old = await upload('ancien-maintenance.wav')
const recent = await upload('recent-maintenance.wav')
await request(`/api/v1/files/${old.id}`, { method: 'DELETE', project: P })
await request(`/api/v1/files/${recent.id}`, { method: 'DELETE', project: P })
await db.query(`UPDATE files SET "trashedAt" = now() - interval '8 days' WHERE "publicId" = $1`, [old.id])

// --- Envoi abandonné ---
const session = await request('/api/v1/uploads', { method: 'POST', project: P, body: { name: 'abandon.wav', mimeType: 'audio/wav', size: 1_000_000 } })
await db.query(`UPDATE upload_sessions SET "expiresAt" = now() - interval '1 hour' WHERE "publicId" = $1`, [session.data.upload.id])

// --- Webhook en échec ---
const hook = await request('/api/v1/webhooks', { method: 'POST', project: P, body: { url: 'http://localhost:4798/hook', events: ['file.uploaded'] } })
await upload('declencheur-webhook.wav')
let failed = null
for (let i = 0; i < 40 && !failed; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 250))
  failed = (await db.query('SELECT id, attempt, "nextAttemptAt" FROM webhook_deliveries WHERE "webhookId" = $1 AND success = false', [hook.data.webhook.id])).rows[0]
}
check('un webhook en échec est programmé pour un nouvel essai', Boolean(failed?.nextAttemptAt) && failed.attempt === 1, failed ? `tentative ${failed.attempt}` : 'aucun envoi')
await db.query(`UPDATE webhook_deliveries SET "nextAttemptAt" = now() - interval '1 second' WHERE id = $1`, [failed?.id])

// --- La tâche planifiée ---
const refused = await fetch(`${BASE}/api/cron/maintenance`, { headers: { Authorization: 'Bearer faux-secret' } })
check('la tâche refuse un appel sans le bon secret', refused.status === 401, String(refused.status))
const run = await fetch(`${BASE}/api/cron/maintenance`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } })
const report = (await run.json()).report
check('la tâche planifiée s’exécute', run.status === 200, JSON.stringify(report))

const oldRow = (await db.query('SELECT 1 FROM files WHERE "publicId" = $1', [old.id])).rowCount
const recentRow = (await db.query('SELECT status FROM files WHERE "publicId" = $1', [recent.id])).rows[0]
check('un fichier resté plus longtemps que prévu à la corbeille est supprimé', oldRow === 0)
check('un fichier récent reste à la corbeille', recentRow?.status === 'TRASHED')
const purgeLog = (await db.query(`SELECT "userAgent" FROM audit_logs WHERE action = 'DELETE_PERMANENT' AND "fileId" = $1`, [old.id])).rows[0]
check('la suppression automatique est journalisée', purgeLog?.userAgent === 'maintenance')

const sessionRow = (await db.query('SELECT status FROM upload_sessions WHERE "publicId" = $1', [session.data.upload.id])).rows[0]
check('un envoi abandonné est fermé', sessionRow?.status === 'ABORTED', sessionRow?.status)

const retried = (await db.query('SELECT attempt, success FROM webhook_deliveries WHERE "webhookId" = $1 ORDER BY attempt', [hook.data.webhook.id])).rows
check('le webhook est relancé et réussit à la deuxième tentative', retried.length === 2 && retried[1].attempt === 2 && retried[1].success === true, JSON.stringify(retried))

const lastRun = (await db.query(`SELECT trigger, "finishedAt" FROM maintenance_runs ORDER BY "startedAt" DESC LIMIT 1`)).rows[0]
check('le passage est enregistré', lastRun?.trigger === 'cron' && Boolean(lastRun.finishedAt))

// --- Ménage : le projet de maintenance est supprimé avec son contenu ---
await request(`/api/v1/projects/${P}`, { method: 'DELETE', body: { confirm: project.name } })
receiver.close()
await db.end()
console.log(failures.length === 0 ? '\nToutes les vérifications sont passées.' : `\n${failures.length} échec(s) : ${failures.join(' | ')}`)
process.exit(failures.length === 0 ? 0 : 1)
