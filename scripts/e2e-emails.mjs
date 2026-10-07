/**
 * Emails et notifications, de bout en bout, contre un serveur SMTP d'essai
 * qui écrit chaque message reçu dans un dossier (MAIL_INBOX).
 *
 * Couvert : email d'essai, accueil et confirmation d'adresse, annonce d'une
 * inscription aux administrateurs, connexion depuis un nouvel appareil (et
 * silence pour un appareil connu), mot de passe changé, ajout à un projet,
 * désabonnement en un clic, alerte de quota par la maintenance.
 *
 * Base locale seulement : le scénario crée puis supprime un compte et un
 * projet sur le disque local.
 *
 * Usage : MAIL_INBOX=<dossier> node scripts/e2e-emails.mjs
 *         (serveur lancé avec SMTP_HOST et SMTP_PORT du serveur d'essai)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import pg from 'pg'

import { melody } from './lib/media.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3200'
const INBOX = process.env.MAIL_INBOX
if (!INBOX || !existsSync(INBOX)) {
  console.error('MAIL_INBOX doit désigner le dossier du serveur SMTP d’essai.')
  process.exit(1)
}
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
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const seen = new Set(readdirSync(INBOX))
/** Messages arrivés depuis le dernier appel. */
function fresh() {
  const files = readdirSync(INBOX).filter((file) => !seen.has(file)).sort()
  for (const file of files) seen.add(file)
  return files.map((file) => JSON.parse(readFileSync(join(INBOX, file), 'utf8')))
}
const mailbox = []
async function waitMail(predicate, timeout = 15_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    mailbox.push(...fresh())
    const found = mailbox.find(predicate)
    if (found) {
      mailbox.splice(mailbox.indexOf(found), 1)
      return found
    }
    await pause(300)
  }
  return null
}

function client(userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36') {
  let cookie = ''
  return async function call(path, { method = 'GET', body, headers = {}, project, redirect = 'follow' } = {}) {
    const init = { method, redirect, headers: { Origin: BASE, Cookie: cookie, 'User-Agent': userAgent, ...headers } }
    if (project) init.headers['X-Project'] = project
    if (body instanceof FormData) init.body = body
    else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    const response = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, init)
    for (const value of response.headers.getSetCookie?.() ?? []) {
      const [pair] = value.split(';')
      const [name] = pair.split('=')
      cookie = [...cookie.split('; ').filter((item) => item && !item.startsWith(`${name}=`)), pair].join('; ')
    }
    const type = response.headers.get('content-type') ?? ''
    const raw = await response.text()
    let data = raw
    if (type.includes('json') && raw) data = JSON.parse(raw)
    return { status: response.status, headers: response.headers, data }
  }
}

const db = new pg.Client({ connectionString: env.DATABASE_URL })
await db.connect()
const ADMIN = process.env.ADMIN_EMAIL ?? 'admin@karaks-storage.local'
const stamp = Date.now()
const email = `essai-mail-${stamp}@example.com`
const password = 'essai-emails-2026-a'
const defaults = (await db.query('SELECT id FROM storage_providers WHERE "isDefault"')).rows.map((row) => row.id)
let projectId = null
let projectName = null

try {
  const admin = client()
  await admin('/api/v1/auth/sign-in/email', { method: 'POST', body: { email: ADMIN, password: process.env.ADMIN_PASSWORD ?? 'ks-admin-dev-2026' } })

  // --- Email d'essai ---
  const test = await admin('/api/v1/notifications/test', { method: 'POST' })
  const testMail = await waitMail((mail) => mail.to.includes(ADMIN) && /essai/i.test(mail.subject))
  check('l’email d’essai part et arrive', test.status === 200 && Boolean(testMail), String(test.status))
  check('il a une version HTML et une version texte', Boolean(testMail?.html) && Boolean(testMail?.text))

  // --- Inscription : accueil, confirmation, annonce ---
  const user = client()
  const signUp = await user('/api/v1/auth/sign-up/email', { method: 'POST', body: { name: 'Essai Emails', email, password, callbackURL: '/dashboard' } })
  const welcome = await waitMail((mail) => mail.to.includes(email) && /Confirmez/.test(mail.subject))
  check('l’inscription envoie l’accueil avec le lien de confirmation', signUp.status === 200 && Boolean(welcome), welcome?.subject)
  const announce = await waitMail((mail) => mail.to.includes(ADMIN) && /Nouveau compte/.test(mail.subject))
  check('les super administrateurs apprennent la nouvelle inscription', Boolean(announce), announce?.subject)

  const link = welcome?.text.match(/https?:\/\/\S+verify-email\S+/)?.[0]
  const verified = link ? await user(link.replace(/^https?:\/\/[^/]+/, ''), { redirect: 'manual' }) : null
  const flag = (await db.query('SELECT "emailVerified", id FROM users WHERE email = $1', [email])).rows[0]
  check('le lien confirme l’adresse', Boolean(verified) && verified.status < 400 && flag?.emailVerified === true, `${verified?.status}`)
  const userId = flag.id

  // --- Connexions ---
  const first = client()
  await first('/api/v1/auth/sign-in/email', { method: 'POST', body: { email, password } })
  check('la première connexion d’un compte neuf ne déclenche pas d’alerte', !(await waitMail((mail) => mail.to.includes(email) && /Nouvelle connexion/.test(mail.subject), 4000)))
  const firefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'
  const other = client(firefox)
  await other('/api/v1/auth/sign-in/email', { method: 'POST', body: { email, password } })
  const alert = await waitMail((mail) => mail.to.includes(email) && /Nouvelle connexion/.test(mail.subject))
  check('un nouvel appareil déclenche une alerte de sécurité', Boolean(alert))
  check('l’alerte décrit l’appareil', /Firefox sur Linux/.test(alert?.text ?? ''))
  check('un email de sécurité n’a pas de lien de désabonnement', alert && !alert.listUnsubscribe && !/Ne plus recevoir/.test(alert.text))
  await client(firefox)('/api/v1/auth/sign-in/email', { method: 'POST', body: { email, password } })
  check('un appareil déjà vu ne déclenche rien', !(await waitMail((mail) => mail.to.includes(email) && /Nouvelle connexion/.test(mail.subject), 4000)))

  // --- Mot de passe ---
  const changed = await first('/api/v1/auth/change-password', { method: 'POST', body: { currentPassword: password, newPassword: `${password}-b`, revokeOtherSessions: false } })
  const passwordMail = await waitMail((mail) => mail.to.includes(email) && /mot de passe/i.test(mail.subject))
  check('un mot de passe changé est signalé', changed.status === 200 && Boolean(passwordMail), String(changed.status))

  // --- Projet sur le disque local, ajout du compte ---
  const local = (await db.query(`SELECT id FROM storage_providers WHERE kind = 'LOCAL'`)).rows[0]
  await db.query('UPDATE storage_providers SET "isDefault" = (id = $1)', [local.id])
  projectName = `Essai emails ${stamp.toString(36)}`
  projectId = (await admin('/api/v1/projects', { method: 'POST', body: { name: projectName } })).data.project.id
  await admin(`/api/v1/projects/${projectId}/members`, { method: 'POST', body: { email, role: 'VIEWER' } })
  const added = await waitMail((mail) => mail.to.includes(email) && /accès au projet/.test(mail.subject))
  check('un ajout à un projet est annoncé', Boolean(added), added?.subject)
  check('avec un désabonnement en un clic', Boolean(added?.listUnsubscribe) && /One-Click/.test(added?.listUnsubscribePost ?? ''))

  const unsubscribeUrl = String(added?.listUnsubscribe?.url ?? added?.listUnsubscribe ?? '').replace(/^<|>$/g, '')
  const tampered = await fetch(unsubscribeUrl.replace(/s=[^&]+/, 's=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click',
  })
  check('une signature falsifiée est refusée', tampered.status === 400, String(tampered.status))
  const oneClick = await fetch(unsubscribeUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' })
  const optOut = (await db.query('SELECT "emailOptOut" FROM users WHERE id = $1', [userId])).rows[0].emailOptOut
  check('le désabonnement en un clic est pris en compte', oneClick.status === 200 && optOut.includes('projects'), JSON.stringify(optOut))
  await admin(`/api/v1/projects/${projectId}/members`, { method: 'POST', body: { email, role: 'DEVELOPER' } })
  check('désabonné, le compte ne reçoit plus les emails de projet', !(await waitMail((mail) => mail.to.includes(email) && /rôle/.test(mail.subject), 4000)))
  const security = await first('/api/v1/me/email-preferences', { method: 'PATCH', body: { optOut: ['security'] } })
  check('la sécurité ne peut pas être désactivée', security.status === 400, String(security.status))

  // --- Alerte de quota, par la maintenance ---
  const form = new FormData()
  form.append('file', new Blob([melody(2, 3)], { type: 'audio/wav' }), 'quota.wav')
  const uploaded = await admin('/api/v1/files/upload', { method: 'POST', body: form, project: projectId })
  await db.query('UPDATE projects SET plan = $2, "storageQuota" = $3 WHERE "publicId" = $1', [projectId, 'SUR_MESURE', Math.ceil(uploaded.data.file.size / 0.9)])
  await admin('/api/cron/maintenance')
  const quota = await waitMail((mail) => mail.to.includes(ADMIN) && /stockage utilisé à 90 %/.test(mail.subject))
  check('un projet à 90 % de son quota déclenche une alerte', Boolean(quota), quota?.subject)
  await admin('/api/cron/maintenance')
  check('la même alerte ne repart pas au passage suivant', !(await waitMail((mail) => mail.to.includes(ADMIN) && /stockage utilisé/.test(mail.subject), 4000)))
} finally {
  if (projectId) {
    // Suppression par l'administrateur, propriétaire du projet.
    const admin = client()
    await admin('/api/v1/auth/sign-in/email', { method: 'POST', body: { email: ADMIN, password: process.env.ADMIN_PASSWORD ?? 'ks-admin-dev-2026' } })
    await admin(`/api/v1/projects/${projectId}`, { method: 'DELETE', body: { confirm: projectName } })
  }
  await db.query('UPDATE storage_providers SET "isDefault" = (id = ANY($1))', [defaults])
  await db.query(`DELETE FROM alert_states WHERE key LIKE 'inscription:%' OR key LIKE 'quota:projet:%'`)
  await db.query('DELETE FROM users WHERE email = $1', [email])
  await db.end()
}

console.log(failures.length === 0 ? '\nToutes les vérifications sont passées.' : `\n${failures.length} échec(s) : ${failures.join(' | ')}`)
process.exit(failures.length === 0 ? 0 : 1)
