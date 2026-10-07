/**
 * Gestion des membres, de bout en bout : invitation d'une adresse inconnue,
 * acceptation par le bon compte seulement, transfert de propriété et retour,
 * retrait, annulation d'une invitation.
 *
 * Les comptes d'essai sont supprimés à la fin, directement en base : le
 * scénario ne tourne que sur la base locale.
 *
 * Usage : node scripts/e2e-membres.mjs  (serveur lancé, projet existant)
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
  console.error('Ce scénario crée et supprime des comptes : il ne tourne que sur la base locale.')
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
      redirect: 'manual',
    })
    for (const value of response.headers.getSetCookie?.() ?? []) {
      const [pair] = value.split(';')
      const [name] = pair.split('=')
      cookie = [...cookie.split('; ').filter((item) => item && !item.startsWith(`${name}=`)), pair].join('; ')
    }
    const type = response.headers.get('content-type') ?? ''
    return { status: response.status, data: type.includes('json') ? await response.json() : await response.text() }
  }
}

const stamp = Date.now()
const invitedEmail = `essai-invite-${stamp}@example.com`
const otherEmail = `essai-autre-${stamp}@example.com`
const created = []
const db = new pg.Client({ connectionString: env.DATABASE_URL })
await db.connect()

const admin = client()
check('l’administrateur se connecte', (await admin('/api/v1/auth/sign-in/email', 'POST', { email: EMAIL, password: PASSWORD })).status === 200)
const project = (await admin('/api/v1/projects')).data.projects[0]
const base = `/api/v1/projects/${project.id}`
const projectRow = (await db.query('SELECT id FROM projects WHERE "publicId" = $1', [project.id])).rows[0]
const originalOwner = (await db.query(`SELECT "userId" FROM project_members WHERE "projectId" = $1 AND role = 'OWNER'`, [projectRow.id])).rows[0]?.userId

// --- Invitation d'une adresse inconnue ---
const invite = await admin(`${base}/members`, 'POST', { email: invitedEmail, role: 'DEVELOPER' })
const url = invite.data.invitation?.url ?? ''
const token = url.split('/invitation/')[1] ?? ''
check('une adresse inconnue reçoit une invitation', invite.status === 202 && token.length >= 20, String(invite.status))
const listed = await admin(`${base}/members`)
check('l’invitation figure parmi les invitations en attente', listed.data.invitations.some((item) => item.email === invitedEmail))
const page = await client()(`/invitation/${token}`)
check('la page d’invitation présente le projet', page.status === 200 && page.data.includes(project.name), String(page.status))
const fake = await client()('/invitation/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
check('un lien inventé ne révèle rien', fake.status === 200 && !fake.data.includes(project.name) && fake.data.includes('non valide'))

// --- Un autre compte ne peut pas l'utiliser ---
const other = client()
await other('/api/v1/auth/sign-up/email', 'POST', { name: 'Essai autre', email: otherEmail, password: 'essai-membres-2026' })
created.push(otherEmail)
const stolen = await other(`/api/v1/invitations/${token}/accept`, 'POST')
check('un compte d’une autre adresse est refusé', stolen.status === 403, String(stolen.status))

// --- Le bon compte l'accepte ---
const invited = client()
await invited('/api/v1/auth/sign-up/email', 'POST', { name: 'Essai invité', email: invitedEmail, password: 'essai-membres-2026' })
created.push(invitedEmail)
const accepted = await invited(`/api/v1/invitations/${token}/accept`, 'POST')
check('le compte invité rejoint le projet', accepted.status === 200 && accepted.data.project?.id === project.id, String(accepted.status))
const members = (await admin(`${base}/members`)).data
const joined = members.members.find((member) => member.email === invitedEmail)
check('avec le rôle prévu', joined?.role === 'DEVELOPER', joined?.role)
check('l’invitation n’est plus en attente', !members.invitations.some((item) => item.email === invitedEmail))
const again = await invited(`/api/v1/invitations/${token}/accept`, 'POST')
check('un lien ne sert qu’une fois', again.status === 410, String(again.status))
const bogus = await invited('/api/v1/invitations/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/accept', 'POST')
check('un jeton inconnu est refusé', bogus.status === 404, String(bogus.status))

// --- Transfert de propriété et retour ---
const notOwner = await invited(`${base}/transfer`, 'POST', { userId: originalOwner })
check('un membre ordinaire ne peut pas transférer', notOwner.status === 403, String(notOwner.status))
const transfer = await admin(`${base}/transfer`, 'POST', { userId: joined.userId })
const roles = Object.fromEntries((await db.query('SELECT "userId", role FROM project_members WHERE "projectId" = $1', [projectRow.id])).rows.map((row) => [row.userId, row.role]))
check('le projet change de propriétaire', transfer.status === 200 && roles[joined.userId] === 'OWNER', String(transfer.status))
check('l’ancien propriétaire reste, en administration', !originalOwner || roles[originalOwner] === 'ADMIN', roles[originalOwner])
const ownerRow = (await db.query('SELECT "ownerId" FROM projects WHERE id = $1', [projectRow.id])).rows[0]
check('la fiche du projet suit', ownerRow.ownerId === joined.userId)
const removeOwner = await admin(`${base}/members/${joined.userId}`, 'DELETE')
check('le propriétaire ne peut pas être retiré', removeOwner.status === 409, String(removeOwner.status))
const demote = await admin(`${base}/members`, 'POST', { email: invitedEmail, role: 'VIEWER' })
check('ni rétrogradé sans transfert', demote.status === 409, String(demote.status))
if (originalOwner) {
  const back = await invited(`${base}/transfer`, 'POST', { userId: originalOwner })
  check('le nouveau propriétaire peut rendre le projet', back.status === 200, String(back.status))
}

// --- Retrait et annulation ---
const removed = await admin(`${base}/members/${joined.userId}`, 'DELETE')
check('un membre se retire', removed.status === 200, String(removed.status))
const second = await admin(`${base}/members`, 'POST', { email: `essai-annule-${stamp}@example.com`, role: 'VIEWER' })
const secondToken = second.data.invitation.url.split('/invitation/')[1]
const revoked = await admin(`${base}/invitations/${second.data.invitation.id}`, 'DELETE')
const dead = await client()(`/invitation/${secondToken}`)
check('une invitation annulée ne mène plus nulle part', revoked.status === 200 && dead.data.includes('non valide'))

const log = (await db.query(`SELECT action FROM audit_logs WHERE "projectId" = $1 AND "createdAt" > to_timestamp($2 / 1000.0)`, [projectRow.id, stamp])).rows.map((row) => row.action)
check('le journal garde la trace des opérations', ['INVITE_MEMBER', 'ADD_MEMBER', 'TRANSFER_OWNERSHIP', 'REMOVE_MEMBER'].every((action) => log.includes(action)), [...new Set(log)].join(', '))

await db.query('DELETE FROM users WHERE email = ANY($1)', [created])
await db.end()
console.log(failures.length === 0 ? '\nToutes les vérifications sont passées.' : `\n${failures.length} échec(s) : ${failures.join(' | ')}`)
process.exit(failures.length === 0 ? 0 : 1)
