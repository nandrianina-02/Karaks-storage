/**
 * Débordement horizontal sur téléphone (390 px) : aucune page ne doit
 * défiler de côté. Usage : node scripts/check-overflow.mjs
 */
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:3200'
const PAGES = ['/', '/docs', '/connexion', '/dashboard', '/fichiers', '/dossiers', '/televersement', '/lectures', '/liens', '/cles-api', '/webhooks', '/statistiques', '/projets', '/journal', '/parametres', '/profil']
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto(`${BASE}/connexion`, { waitUntil: 'networkidle' })
await page.fill('#email', process.env.ADMIN_EMAIL ?? 'admin@karaks-storage.local')
await page.fill('#password', process.env.ADMIN_PASSWORD ?? 'ks-admin-dev-2026')
for (let attempt = 0; attempt < 3; attempt += 1) {
  await page.click('button[type="submit"]')
  if (await page.waitForURL((url) => !url.pathname.startsWith('/connexion'), { timeout: 8000 }).then(() => true).catch(() => false)) break
  await page.waitForTimeout(61000)
}
let failures = 0
for (const path of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  const ok = width <= 390
  if (!ok) failures += 1
  console.log(`[${ok ? 'OK  ' : 'ECHEC'}] ${path} — ${width} px`)
}
await browser.close()
process.exit(failures ? 1 : 0)
