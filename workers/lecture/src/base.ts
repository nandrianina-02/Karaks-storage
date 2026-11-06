import postgres from 'postgres'

/**
 * Ce que le Worker lit dans la base de Karaks Storage (Supabase), et la
 * seule écriture qu'il y fait : les compteurs d'écoute. Les noms de tables
 * et de colonnes sont ceux de `prisma/schema.prisma` (tables en `@@map`,
 * colonnes en camelCase, d'où les guillemets).
 */

export interface CleApi {
  id: string
  revoquee: boolean
  /** Fin de validité en millisecondes, ou null. */
  expire: number | null
  permissions: string[]
  projet: { id: string; publicId: string; origines: string[] }
}

export interface Fichier {
  id: string
  fournisseur: string
  objet: string | null
  type: string
  nom: string
  taille: number
}

export interface Base {
  cleApi(empreinte: string): Promise<CleApi | null>
  fichier(projet: string, publicId: string): Promise<Fichier | null>
  /** Un fichier mis à la corbeille ne se lit plus, même par un jeton encore valable. */
  fichierActif(id: string): Promise<boolean>
  compterOuverture(id: string, telechargement: boolean): Promise<void>
  /** Jeton Google chiffré du fournisseur ; null s'il n'en a pas (repli sur GOOGLE_REFRESH_TOKEN). */
  fournisseur(id: string): Promise<{ type: string; identifiants: string | null } | null>
  fermer(): Promise<void>
}

/**
 * L'adresse de l'application est écrite pour Prisma (`?pgbouncer=true`,
 * `connection_limit`…). La bibliothèque postgres enverrait ces paramètres au
 * serveur comme réglages de session, qu'il refuserait : on les retire. On
 * peut donc reprendre telle quelle la DATABASE_URL de l'application.
 */
export function adressePostgres(adresse: string): string {
  const u = new URL(adresse)
  for (const p of ['pgbouncer', 'connection_limit', 'pool_timeout', 'connect_timeout', 'schema', 'statement_cache_size']) u.searchParams.delete(p)
  return u.toString()
}

/**
 * Une connexion par requête : un Worker ne peut pas garder une socket d'une
 * requête à l'autre. `prepare: false` pour le pooler de Supabase en mode
 * transaction ; `fetch_types: false` évite une requête de plus à chaque
 * connexion (les tableaux sont lus en JSON).
 */
export function ouvrirBase(adresse: string): Base {
  const sql = postgres(adressePostgres(adresse), { max: 1, prepare: false, fetch_types: false, idle_timeout: 5, connect_timeout: 10, ssl: 'require' })
  return {
    async cleApi(empreinte) {
      const [l] = await sql<
        { id: string; revoquee: boolean; expire: number | null; permissions: string[]; projet: string; publicId: string; origines: string[] }[]
      >`
        SELECT k.id, k."revokedAt" IS NOT NULL AS revoquee,
          (extract(epoch FROM k."expiresAt") * 1000)::float8 AS expire,
          array_to_json(k.permissions) AS permissions,
          p.id AS projet, p."publicId", array_to_json(p."allowedOrigins") AS origines
        FROM api_keys k JOIN projects p ON p.id = k."projectId"
        WHERE k.hash = ${empreinte}`
      if (!l) return null
      return {
        id: l.id,
        revoquee: l.revoquee,
        expire: l.expire,
        permissions: l.permissions ?? [],
        projet: { id: l.projet, publicId: l.publicId, origines: l.origines ?? [] },
      }
    },

    async fichier(projet, publicId) {
      const [l] = await sql<{ id: string; fournisseur: string; objet: string | null; type: string; nom: string; taille: string }[]>`
        SELECT id, "providerId" AS fournisseur, "providerFileId" AS objet, "mimeType" AS type, "originalName" AS nom, size::text AS taille
        FROM files WHERE "projectId" = ${projet} AND "publicId" = ${publicId} AND status = 'ACTIVE'`
      return l ? { ...l, taille: Number(l.taille) } : null
    },

    async fichierActif(id) {
      const [l] = await sql`SELECT 1 FROM files WHERE id = ${id} AND status = 'ACTIVE'`
      return Boolean(l)
    },

    async compterOuverture(id, telechargement) {
      if (telechargement) {
        await sql`UPDATE files SET "downloadCount" = "downloadCount" + 1, "lastAccessAt" = now() WHERE id = ${id}`
      } else {
        await sql`UPDATE files SET "streamCount" = "streamCount" + 1, "lastAccessAt" = now() WHERE id = ${id}`
      }
    },

    async fournisseur(id) {
      const [l] = await sql<{ type: string; identifiants: string | null }[]>`
        SELECT kind::text AS type, credentials AS identifiants FROM storage_providers WHERE id = ${id}`
      return l ?? null
    },

    fermer: () => sql.end({ timeout: 2 }),
  }
}
