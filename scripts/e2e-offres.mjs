/**
 * Offres et limites des projets, de bout en bout.
 *
 * Le scénario change l'offre d'un projet existant, vérifie que les limites
 * suivent, que la saisie manuelle n'est admise qu'en sur mesure et qu'un
 * propriétaire de projet ne peut pas relever ses propres limites. Le projet
 * retrouve ses réglages à la fin. Il ajoute un compte jetable en base : il
 * ne tourne donc que sur la base locale.
 *
 * Usage : node scripts/e2e-offres.mjs  (serveur lancé)
 */
import { readFileSync } from 'node:fs'

import pg from 'pg'

const BASE = process.env.BASE_URL ?? 'http://localhost:3200'
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@karaks-storage.local'
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'ks-admin-dev-2026'
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
)
if (!['localhost', '127.0.0.1'].includes(new URL(env.DATABASE_URL).hostname)) {
  console.error('Ce scénario modifie la base : il ne tourne que sur la base locale.')
  process.exit(1)
}

const failures = []
function check(label, ok, detail = '') {
  console.log(`[${ok ? 'OK  ' : 'ECHEC'}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

function client() {
  let cookie = ''
  return async function call(path, method = 'GET', body) {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: { Origin: BASE, Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = response.headers.getSetCookie?.() ?? []
    if (set.length) cookie = set.map((value) => value.split(';')[0]).join('; ')
    return { status: response.status, data: await response.json().catch(() => null) }
  }
}

const MB = 1024 * 1024
const admin = client()
const login = await admin('/api/v1/auth/sign-in/email', 'POST', { email: EMAIL, password: PASSWORD })
check('le super administrateur se connecte', login.status === 200, String(login.status))
const list = await admin('/api/v1/projects')
const original = list.data?.data?.projects?.[0] ?? list.data?.projects?.[0]
if (!original) {
  console.error('Aucun projet en base locale.')
  process.exit(1)
}
const path = `/api/v1/projects/${original.id}`
const project = (response) => response.data?.data?.project ?? response.data?.project

const essai = await admin(path, 'PATCH', { plan: 'ESSAI' })
const p1 = project(essai)
check(
  'l’offre Essai recopie ses limites',
  essai.status === 200 && p1?.plan === 'ESSAI' && p1.maxFileSize === 50 * MB && p1.storageQuota === 1024 * MB && p1.rateLimitPerMinute === 60,
  JSON.stringify(p1 && { plan: p1.plan, max: p1.maxFileSize, quota: p1.storageQuota, rate: p1.rateLimitPerMinute }),
)
const manual = await admin(path, 'PATCH', { maxFileSize: 10 * MB })
check('une limite ne se saisit pas hors du sur mesure', manual.status === 400, String(manual.status))
const custom = await admin(path, 'PATCH', { plan: 'SUR_MESURE', maxFileSize: 10 * MB })
check('en sur mesure, la limite saisie est retenue', custom.status === 200 && project(custom)?.maxFileSize === 10 * MB, String(custom.status))
check('le passage en sur mesure garde le reste des valeurs', project(custom)?.rateLimitPerMinute === 60)

// --- Un propriétaire qui n'est pas super administrateur ---
const db = new pg.Client({ connectionString: env.DATABASE_URL })
await db.connect()
const ownerEmail = `essai-offre-${Date.now()}@example.com`
const owner = client()
await owner('/api/v1/auth/sign-up/email', 'POST', { name: 'Essai offre', email: ownerEmail, password: 'essai-offre-2026' })
const ownerId = (await db.query('SELECT id FROM users WHERE email = $1', [ownerEmail])).rows[0].id
const projectRow = (await db.query('SELECT id FROM projects WHERE "publicId" = $1', [original.id])).rows[0]
await db.query(
  `INSERT INTO project_members (id, "projectId", "userId", role, "createdAt") VALUES ($1, $2, $3, 'OWNER', now())`,
  [`essai_${Date.now()}`, projectRow.id, ownerId],
)
const raise = await owner(path, 'PATCH', { plan: 'PRO' })
check('un propriétaire ne peut pas changer d’offre', raise.status === 403, String(raise.status))
const raiseLimit = await owner(path, 'PATCH', { maxFileSize: 4096 * MB })
check('ni relever une limite', raiseLimit.status === 403, String(raiseLimit.status))
const rename = await owner(path, 'PATCH', { trashRetentionDays: original.trashRetentionDays })
check('mais il règle toujours la corbeille', rename.status === 200, String(rename.status))
await db.query('DELETE FROM users WHERE id = $1', [ownerId])

// --- Remise en état ---
const restored = await admin(path, 'PATCH', {
  plan: 'SUR_MESURE',
  maxFileSize: original.maxFileSize,
  storageQuota: original.storageQuota,
  rateLimitPerMinute: original.rateLimitPerMinute,
  signedUrlPerMinute: original.signedUrlPerMinute,
})
if (original.plan !== 'SUR_MESURE') await admin(path, 'PATCH', { plan: original.plan })
check('le projet retrouve ses réglages', restored.status === 200)
await db.end()

console.log(failures.length === 0 ? '\nToutes les vérifications sont passées.' : `\n${failures.length} échec(s) : ${failures.join(' | ')}`)
process.exit(failures.length === 0 ? 0 : 1)
