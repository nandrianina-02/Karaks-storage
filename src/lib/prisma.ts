import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

/**
 * Client Prisma partagé.
 *
 * Prisma 7 passe par un driver adapter : on branche le driver `pg` sur
 * PostgreSQL. Le client est mémorisé sur l'objet global car en développement
 * Next.js recharge les modules à chaque modification, ce qui créerait sinon
 * un nouveau pool de connexions à chaque sauvegarde jusqu'à épuiser les
 * connexions disponibles.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,

    // Le serveur ferme de lui-même les connexions restées inactives. Sans
    // ces réglages, le pool conserve une connexion déjà morte et la première
    // requête suivante échoue en P1017 (« Server has closed the
    // connection ») : on ferme donc côté client avant le serveur, et on
    // maintient les connexions actives éveillées.
    idleTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,

    // Le serveur fourni par `prisma dev` supporte très mal les connexions
    // concurrentes : au-delà d'une poignée, il continue d'écouter mais coupe
    // toute nouvelle connexion, et l'application échoue en « Connection
    // terminated unexpectedly ». Une connexion par processus suffit en
    // développement — les requêtes lancées en parallèle sont simplement
    // sérialisées par le pool.
    //
    // Un PostgreSQL de production n'a pas cette contrainte : la valeur est
    // relevée par `DATABASE_POOL_MAX`.
    max: Number(process.env.DATABASE_POOL_MAX) || 1,
    connectionTimeoutMillis: 10_000,
  })

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
