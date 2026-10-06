/**
 * Jeu de démonstration pour le développement : un projet et quelques
 * fichiers générés (aucun contenu sous droits). Passe par l'API, comme un
 * client réel.
 *
 * Usage : node scripts/demo-data.mjs  (serveur lancé, super admin créé)
 */
import { melody, png } from './lib/media.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3200'
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@karaks-storage.local'
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'ks-admin-dev-2026'

let cookie = ''
async function call(path, { method = 'GET', body, headers = {}, project } = {}) {
  const init = { method, headers: { Origin: BASE, Cookie: cookie, ...headers } }
  if (project) init.headers['X-Project'] = project
  if (body !== undefined) {
    if (body instanceof Uint8Array) init.body = body
    else {
      init.headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
  }
  const response = await fetch(`${BASE}${path}`, init)
  const setCookie = response.headers.getSetCookie?.() ?? []
  if (setCookie.length) cookie = setCookie.map((value) => value.split(';')[0]).join('; ')
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${method} ${path} : ${response.status} ${JSON.stringify(data)}`)
  return data
}

/** Crêtes d'un WAV mono 16 bits, comme les calcule le navigateur. */
function peaks(wav, bars = 96) {
  const view = Buffer.from(wav.buffer, wav.byteOffset + 44)
  const count = view.length / 2
  const size = Math.floor(count / bars)
  const values = []
  for (let bar = 0; bar < bars; bar += 1) {
    let max = 0
    for (let i = bar * size; i < (bar + 1) * size; i += 8) max = Math.max(max, Math.abs(view.readInt16LE(i * 2)))
    values.push(max)
  }
  const top = Math.max(...values, 1)
  return values.map((value) => Math.max(2, Math.round((value / top) * 100)))
}

async function upload(project, name, mimeType, data, extra = {}) {
  const created = await call('/api/v1/uploads', {
    method: 'POST',
    project,
    body: { name, mimeType, size: data.length, ...extra },
  })
  let received = 0
  let file = null
  while (received < data.length) {
    const end = Math.min(received + created.chunkSize, data.length) - 1
    const result = await call(`/api/v1/uploads/${created.upload.id}`, {
      method: 'PUT',
      project,
      headers: { 'Content-Range': `bytes ${received}-${end}/${data.length}` },
      body: data.subarray(received, end + 1),
    })
    received = result.upload.received
    file = result.file
  }
  return file
}

await call('/api/v1/auth/sign-in/email', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })
const { projects } = await call('/api/v1/projects')
let project = projects.find((item) => item.slug === 'karaks-production')
if (!project) {
  project = (
    await call('/api/v1/projects', {
      method: 'POST',
      body: { name: 'Karaks Production', description: 'Instrumentaux, pochettes et visuels de Karaks.', allowedOrigins: ['http://localhost:3000'] },
    })
  ).project
}
const id = project.id
const { folders } = await call('/api/v1/folders', { project: id })
const folderIds = {}
for (const name of ['audio', 'covers', 'artists', 'albums']) {
  folderIds[name] = folders.find((folder) => folder.name === name)?.id ?? (await call('/api/v1/folders', { method: 'POST', project: id, body: { name } })).folder.id
}

const songs = [
  ['chante-ta-passion.wav', 34, 1],
  ['nuit-de-tana.wav', 41, 2],
  ['reve-en-couleur.wav', 27, 3],
]
for (const [name, seconds, seed] of songs) {
  const wav = melody(seconds, seed)
  await upload(id, name, 'audio/wav', wav, { folderId: folderIds.audio, durationSeconds: seconds, waveform: peaks(wav) })
}
await upload(id, 'cover-album.png', 'image/png', png(480, 480, [130, 26, 193]), { folderId: folderIds.covers, width: 480, height: 480 })
await upload(id, 'artiste-portrait.png', 'image/png', png(320, 400, [249, 13, 145]), { folderId: folderIds.artists, width: 320, height: 400 })
await upload(id, 'logo.png', 'image/png', png(256, 256, [47, 107, 255]), { width: 256, height: 256 })
await upload(id, 'readme.txt', 'text/plain', new TextEncoder().encode('Karaks Storage : fichiers de démonstration générés.\n'))
console.log(`Projet ${project.name} (${id}) prêt avec ${songs.length + 4} fichiers.`)
