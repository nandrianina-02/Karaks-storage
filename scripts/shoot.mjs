/**
 * Captures d'écran des pages, pour comparer à la maquette.
 * Usage : node scripts/shoot.mjs /fichiers /dashboard ...  (sortie dans SHOTS_DIR)
 */
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { chromium } from 'playwright-core'

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((path) => existsSync(path))
const BASE = process.env.BASE_URL ?? 'http://localhost:3200'
const OUT = process.env.SHOTS_DIR ?? 'shots'
const WIDTH = Number(process.env.WIDTH ?? 1536)
const HEIGHT = Number(process.env.HEIGHT ?? 1024)
const THEME = process.env.THEME ?? 'dark'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })
await context.addInitScript((theme) => localStorage.setItem('ks-theme', theme), THEME)
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))

if (process.env.NO_LOGIN !== '1') {
  await page.goto(`${BASE}/connexion`, { waitUntil: 'networkidle' })
  await page.fill('#email', process.env.ADMIN_EMAIL ?? 'admin@karaks-storage.local')
  await page.fill('#password', process.env.ADMIN_PASSWORD ?? 'ks-admin-dev-2026')
  // La connexion est limitée à cinq essais par minute : après une série de
  // captures, on attend la fenêtre suivante plutôt que d'échouer.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.click('button[type="submit"]')
    const signedIn = await page
      .waitForURL((url) => !url.pathname.startsWith('/connexion'), { timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    if (signedIn) break
    await page.waitForTimeout(61000)
  }
}

/**
 * Chaque argument est une adresse, suivie au besoin d'actions séparées par
 * « | » : `click:<texte>` ou `wait:<ms>`. Exemple :
 *   "/fichiers|click:audio|click:chante-ta-passion.wav"
 */
for (const spec of process.argv.slice(2)) {
  const [path, ...steps] = spec.split('|')
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 60000 })
  for (const step of steps) {
    const [kind, ...rest] = step.split(':')
    const value = rest.join(':')
    if (kind === 'click') {
      await page.getByText(value, { exact: true }).first().click()
      await page.waitForLoadState('networkidle')
    }
    if (kind === 'button') await page.getByRole('button', { name: value }).first().click()
    if (kind === 'wait') await page.waitForTimeout(Number(value))
  }
  await page.waitForTimeout(900)
  const name = (process.env.NAME ?? spec).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'accueil'
  await page.screenshot({ path: join(OUT, `${name}-${WIDTH}-${THEME}.png`), fullPage: process.env.FULL === '1' })
  console.log(`capture : ${name}`)
}
console.log(errors.length ? `Erreurs :\n${errors.join('\n')}` : 'Aucune erreur dans la console.')
await browser.close()
