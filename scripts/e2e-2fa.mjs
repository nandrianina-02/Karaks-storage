/**
 * Double authentification, de bout en bout.
 *
 * Le scénario ouvre un compte jetable, active la double authentification,
 * calcule lui-même les codes à six chiffres (RFC 6238, comme une application
 * de téléphone), puis vérifie la connexion en deux étapes, le refus d'un faux
 * code, un code de secours et la désactivation. Le compte est supprimé à la
 * fin, directement en base : il ne tourne donc que sur la base locale.
 *
 * Usage : node scripts/e2e-2fa.mjs  (serveur lancé)
 */
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

import pg from 'pg'

const BASE = process.env.BASE_URL ?? 'http://localhost:3200'
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
)
if (!['localhost', '127.0.0.1'].includes(new URL(env.DATABASE_URL).hostname)) {
  console.error('Ce scénario supprime un compte en base : il ne tourne que sur la base locale.')
  process.exit(1)
}

const failures = []
function check(label, ok, detail = '') {
  console.log(`[${ok ? 'OK  ' : 'ECHEC'}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

/** Code TOTP (RFC 6238 : SHA-1, 30 s, 6 chiffres) à partir de la clé base32. */
function totp(secret, offset = 0) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30) + offset))
  const hmac = createHmac('sha1', key).update(counter).digest()
  const start = hmac[hmac.length - 1] & 0xf
  return String((hmac.readUInt32BE(start) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

/**
 * La vérification des codes est limitée à trois essais par tranche de dix
 * secondes, et la connexion à cinq par minute : le scénario patiente entre
 * ses groupes d'essais, comme le ferait une personne.
 */
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function client() {
  let cookie = ''
  return async function call(path, body) {
    const response = await fetch(`${BASE}/api/v1/auth${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: BASE, Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    for (const value of response.headers.getSetCookie?.() ?? []) {
      const [pair] = value.split(';')
      const [name] = pair.split('=')
      cookie = [...cookie.split('; ').filter((item) => item && !item.startsWith(`${name}=`)), pair].join('; ')
    }
    return { status: response.status, data: await response.json().catch(() => null) }
  }
}

const email = `essai-2fa-${Date.now()}@example.com`
const password = 'essai-double-auth-2026'

// --- Compte jetable et activation ---
const owner = client()
const signUp = await owner('/sign-up/email', { name: 'Essai double authentification', email, password })
check('un compte d’essai s’ouvre', signUp.status === 200, String(signUp.status))
const enabled = await owner('/two-factor/enable', { password, method: 'totp', issuer: 'Karaks Storage' })
const uri = enabled.data?.totpURI ?? ''
const secret = uri ? new URL(uri).searchParams.get('secret') : ''
check('l’activation renvoie un QR code et dix codes de secours', /^otpauth:\/\/totp\//.test(uri) && enabled.data?.backupCodes?.length === 10)
check('l’émetteur affiché est Karaks Storage', /issuer=Karaks(%20|\+)Storage/.test(uri))
const wrongActivation = await owner('/two-factor/verify-totp', { code: '000000' })
check('un faux code ne confirme pas l’activation', wrongActivation.status !== 200, String(wrongActivation.status))
const confirmed = await owner('/two-factor/verify-totp', { code: totp(secret) })
check('le code de l’application confirme l’activation', confirmed.status === 200, String(confirmed.status))

// --- Connexion en deux étapes ---
await pause(11_000)
const visitor = client()
const first = await visitor('/sign-in/email', { email, password })
check('le mot de passe seul ne suffit plus', first.data?.twoFactorRedirect === true, JSON.stringify(first.data))
const noSession = await visitor('/get-session')
check('aucune session n’est ouverte avant le code', !noSession.data?.session)
const bad = await visitor('/two-factor/verify-totp', { code: '123456' })
check('un faux code est refusé', bad.status !== 200, String(bad.status))
const good = await visitor('/two-factor/verify-totp', { code: totp(secret) })
const session = await visitor('/get-session')
check('le bon code ouvre la session', good.status === 200 && session.data?.user?.email === email, `${good.status} ${JSON.stringify(good.data).slice(0, 160)}`)

// --- Code de secours ---
await pause(11_000)
const lost = client()
await lost('/sign-in/email', { email, password })
const backupCode = enabled.data.backupCodes[0]
const backup = await lost('/two-factor/verify-backup-code', { code: backupCode })
check('un code de secours ouvre la session', backup.status === 200, String(backup.status))
await pause(11_000)
const again = client()
await again('/sign-in/email', { email, password })
const reused = await again('/two-factor/verify-backup-code', { code: backupCode })
check('un code de secours ne sert qu’une fois', reused.status !== 200, String(reused.status))

// --- Journal ---
const db = new pg.Client({ connectionString: env.DATABASE_URL })
await db.connect()
const user = (await db.query('SELECT id FROM users WHERE email = $1', [email])).rows[0]
const logins = (await db.query(`SELECT details FROM audit_logs WHERE action = 'LOGIN' AND "userId" = $1`, [user.id])).rows
check('la connexion par code est journalisée', logins.some((row) => row.details?.twoFactor === true), `${logins.length} connexions`)
// Tant que la double authentification est active, chaque connexion passe par
// un code : une étape « mot de passe vérifié, code attendu » n'en est pas une.
const passwordOnly = logins.filter((row) => row.details?.twoFactor === false).length
check('le mot de passe seul n’est pas journalisé comme une connexion', passwordOnly === 0, `${passwordOnly} entrée(s) sans code`)

// --- Désactivation ---
await pause(11_000)
const disabled = await visitor('/two-factor/disable', { password })
const plain = client()
const direct = await plain('/sign-in/email', { email, password })
check('une fois désactivée, le mot de passe suffit de nouveau', disabled.status === 200 && !direct.data?.twoFactorRedirect && direct.status === 200)

await db.query('DELETE FROM users WHERE id = $1', [user.id])
await db.end()
console.log(failures.length === 0 ? '\nToutes les vérifications sont passées.' : `\n${failures.length} échec(s) : ${failures.join(' | ')}`)
process.exit(failures.length === 0 ? 0 : 1)
