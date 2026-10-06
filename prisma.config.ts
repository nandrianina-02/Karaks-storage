import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
    // Base jetable utilisée par Prisma Migrate pour comparer l'état attendu
    // du schéma à l'état réel. Le serveur `prisma dev` en expose une sur le
    // port voisin.
    shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'],
  },
})
