/**
 * Recherche avancée de l'explorateur, dans un vrai navigateur : la barre de
 * filtres s'ouvre, chaque choix passe dans l'adresse et filtre la liste, et
 * « Effacer » ramène la vue complète.
 *
 * Usage : node scripts/e2e-filtres.mjs  (serveur lancé, projet avec fichiers)
 */
import { existsSync } from 'node:fs'

import { chromium } from 'playwright-core'

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((path) => existsSync(path))
const BASE = process.env.BASE_URL ?? 'http://localhost:3200'
const SHOT = process.env.SCREENSHOT

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

const rows = () => page.locator('table tbody tr').count()
await page.goto(`${BASE}/fichiers`, { waitUntil: 'networkidle' })
const before = await rows()
await page.getByRole('button', { name: /Filtres/ }).click()
check('la barre de filtres s’ouvre', await page.locator('#files-filters').isVisible())

await page.selectOption('#f-type', 'image')
await page.waitForURL(/type=image/)
await page.waitForLoadState('networkidle')
const images = await page.locator('table tbody tr').allInnerTexts()
check('le filtre de type passe dans l’adresse', page.url().includes('type=image'))
check(
  'seules des images restent',
  images.every((text) => /image|png|jpe?g|webp|gif|svg/i.test(text)) || images.length === 0 || (await page.getByText('Aucun fichier ne correspond à ces filtres').isVisible()),
  `${images.length} ligne(s)`,
)
check('le bouton compte un filtre actif', /1/.test(await page.getByRole('button', { name: /Filtres/ }).innerText()))

await page.selectOption('#f-added', 'plage')
await page.waitForURL(/ajout=plage/)
check('la période précise affiche ses bornes', (await page.locator('#f-from').isVisible()) && (await page.locator('#f-to').isVisible()))

await page.selectOption('#f-size', 'plus-100')
await page.waitForURL(/taille=plus-100/)
await page.waitForLoadState('networkidle')
if (SHOT) await page.screenshot({ path: SHOT })
await page.getByRole('button', { name: /^Effacer/ }).first().click()
await page.waitForURL((url) => !url.search.includes('type='))
await page.waitForLoadState('networkidle')
check('« Effacer » rend la liste complète', (await rows()) === before, `${before} ligne(s)`)

await browser.close()
console.log(failures.length === 0 ? '\nToutes les vérifications sont passées.' : `\n${failures.length} échec(s) : ${failures.join(' | ')}`)
process.exit(failures.length === 0 ? 0 : 1)
