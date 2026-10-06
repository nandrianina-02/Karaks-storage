/**
 * Applique les migrations Prisma par le pilote pg.
 *
 * Pour les bases joignables seulement par un pooler en mode transaction
 * (Supabase, port 6543) : Prisma Migrate y reste bloqué, faute de verrou de
 * session. Chaque migration part en une seule requête, dans une transaction,
 * et s'inscrit dans `_prisma_migrations` avec la même empreinte que Prisma :
 * `prisma migrate status` la reconnaît ensuite comme appliquée.
 *
 * L'adresse de la base n'est jamais affichée.
 *
 * Usage : node scripts/db-apply.mjs [NOM_DE_VARIABLE]
 *   La variable est lue dans l'environnement ou dans .env (défaut DATABASE_URL).
 */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

import pg from 'pg'

const name = process.argv[2] ?? 'DATABASE_URL'
const fromFile = existsSync('.env')
  ? Object.fromEntries(
      readFileSync('.env', 'utf8')
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
        .filter(Boolean)
        .map((match) => [match[1], match[2]]),
    )
  : {}
const raw = process.env[name] ?? fromFile[name]
if (!raw) {
  console.error(`${name} est vide.`)
  process.exit(1)
}

const url = new URL(raw)
url.searchParams.delete('pgbouncer')
const local = ['localhost', '127.0.0.1'].includes(url.hostname)
const client = new pg.Client({
  connectionString: url.toString(),
  ssl: local ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})
await client.connect()
console.log(`Base : ${url.hostname}`)

await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`)

const applied = new Set(
  (await client.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rows.map(
    (row) => row.migration_name,
  ),
)
const names = readdirSync('prisma/migrations', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

for (const migration of names) {
  if (applied.has(migration)) {
    console.log(`déjà appliquée  ${migration}`)
    continue
  }
  const sql = readFileSync(`prisma/migrations/${migration}/migration.sql`)
  const checksum = createHash('sha256').update(sql).digest('hex')
  // Une seule requête par migration : le pooler garde la même connexion
  // jusqu'à la fin de la transaction.
  await client.query(
    `BEGIN;\n${sql.toString('utf8')}\n;INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) ` +
      `VALUES ('${randomUUID()}', '${checksum}', now(), '${migration}', 1);\nCOMMIT;`,
  )
  console.log(`appliquée       ${migration}`)
}

const tables = await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'")
console.log(`${tables.rows[0].n} tables.`)
await client.end()
