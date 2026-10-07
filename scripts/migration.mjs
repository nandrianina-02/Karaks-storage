/**
 * Crée une migration Prisma à partir de la différence entre le schéma
 * enregistré dans Git (HEAD) et le schéma de travail, puis l'applique à la
 * base locale.
 *
 * `prisma migrate dev` refuse de tourner hors d'un terminal interactif ; ce
 * script fait le même travail sans question, pour les changements additifs.
 *
 * Usage : node scripts/migration.mjs <nom_de_la_migration>
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const name = process.argv[2]
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('Usage : node scripts/migration.mjs <nom_en_minuscules>')
  process.exit(1)
}

const before = join(tmpdir(), `schema-avant-${Date.now()}.prisma`)
writeFileSync(before, execFileSync('git', ['show', 'HEAD:prisma/schema.prisma']))

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const sql = execFileSync(npx, ['prisma', 'migrate', 'diff', '--from-schema', before, '--to-schema', 'prisma/schema.prisma', '--script'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
})
  .split('\n')
  .filter((line) => !/CreateSchema|CREATE SCHEMA/.test(line))
  .join('\n')
  .trim()

if (!sql || /^-- This is an empty migration/.test(sql)) {
  console.log('Aucune différence de schéma.')
  process.exit(0)
}

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const dir = join('prisma', 'migrations', `${stamp}_${name}`)
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'migration.sql'), `${sql}\n`)
console.log(`Migration écrite : ${dir}\n\n${sql}\n`)

execFileSync(process.execPath, ['scripts/db-apply.mjs'], { stdio: 'inherit' })
execFileSync(npx, ['prisma', 'generate'], { stdio: 'ignore', shell: process.platform === 'win32' })
console.log('Client Prisma régénéré.')
