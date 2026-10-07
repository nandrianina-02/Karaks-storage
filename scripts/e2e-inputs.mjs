/**
 * Saisie dans les dialogues : ce qu'on tape doit arriver tel quel, sans que
 * le curseur saute ni que le focus change de champ.
 *
 * Régression visée : le dialogue rejouait son effet d'ouverture à chaque
 * frappe et redonnait le focus au premier champ.
 *
 * Usage : node scripts/e2e-inputs.mjs  (serveur lancé, projet existant)
 */
import { existsSync } from 'node:fs'

import { chromium } from 'playwright-core'

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((path) => existsSync(path))
const BASE = process.env.BASE_URL ?? 'http://localhost:3200'

const failures = []
function check(label, ok, detail = '') {
  console.log(`[${ok ? 'OK  ' : 'ECHEC'}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto(`${BASE}/connexion`, { waitUntil: 'networkidle' })
await page.fill('#email', process.env.ADMIN_EMAIL ?? 'admin@karaks-storage.local')
await page.fill('#password', process.env.ADMIN_PASSWORD ?? 'ks-admin-dev-2026')
for (let attempt = 0; attempt < 3; attempt += 1) {
  if (!page.url().includes('/connexion')) break
  await page.click('button[type="submit"]')
  if (await page.waitForURL((url) => !url.pathname.startsWith('/connexion'), { timeout: 30000 }).then(() => true).catch(() => false)) break
  await page.waitForTimeout(61000)
}

// Frappe caractère par caractère, comme une personne : c'est chaque frappe
// qui déclenchait le défaut, pas un remplissage d'un seul coup.
async function typeAndRead(selector, text) {
  await page.click(selector)
  await page.keyboard.type(text, { delay: 25 })
  return page.inputValue(selector)
}

// Dialogue à un champ : nouveau dossier.
await page.goto(`${BASE}/fichiers`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Nouveau dossier' }).first().click()
await page.waitForSelector('#folder-name')
const folder = await typeAndRead('#folder-name', 'covers-albums')
check('le nom de dossier se tape sans perte', folder === 'covers-albums', JSON.stringify(folder))
await page.keyboard.press('Escape')

// Dialogue à plusieurs champs : nouvelle clé API, puis le second champ.
await page.goto(`${BASE}/cles-api`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Nouvelle clé' }).first().click()
await page.waitForSelector('#key-name')
const keyName = await typeAndRead('#key-name', 'Karaks web')
check('le nom de clé se tape sans perte', keyName === 'Karaks web', JSON.stringify(keyName))
await page.focus('#key-expires')
await page.selectOption('#key-expires', '90')
await page.waitForTimeout(300)
const focusAfterSelect = await page.evaluate(() => document.activeElement?.id)
check('choisir une option ne renvoie pas le focus au premier champ', focusAfterSelect === 'key-expires', focusAfterSelect)
await page.keyboard.press('Escape')

// Saisie au milieu d'un texte : le curseur ne doit pas sauter en fin de champ.
await page.goto(`${BASE}/fichiers`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Nouveau dossier' }).first().click()
await page.waitForSelector('#folder-name')
await page.click('#folder-name')
await page.keyboard.type('abef', { delay: 25 })
for (let i = 0; i < 2; i += 1) await page.keyboard.press('ArrowLeft')
await page.keyboard.type('cd', { delay: 25 })
const middle = await page.inputValue('#folder-name')
check('une insertion au milieu reste au milieu', middle === 'abcdef', JSON.stringify(middle))
await page.keyboard.press('Escape')

// Paramètres du projet (formulaire de page, sans dialogue).
await page.goto(`${BASE}/parametres?onglet=projet`, { waitUntil: 'networkidle' })
if (await page.locator('#s-description').count()) {
  await page.fill('#s-description', '')
  const description = await typeAndRead('#s-description', 'Instrumentaux et pochettes')
  check('la description du projet se tape sans perte', description === 'Instrumentaux et pochettes', JSON.stringify(description))
}

await browser.close()
console.log(failures.length === 0 ? '\nToutes les vérifications sont passées.' : `\n${failures.length} échec(s) : ${failures.join(' | ')}`)
process.exit(failures.length === 0 ? 0 : 1)
