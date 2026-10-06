import { z } from 'zod'

/**
 * Variables d'environnement, validées au démarrage (CDS 30).
 *
 * Une variable manquante doit casser franchement au lancement plutôt que
 * provoquer une erreur obscure au premier appel d'API.
 */
const optional = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined))

const schema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL doit être une URL de connexion valide'),
  APP_URL: z.string().url().default('http://localhost:3200'),

  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET : 32 caractères au moins'),
  API_SECRET: z.string().min(32, 'API_SECRET : 32 caractères au moins'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY : 32 caractères au moins'),

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  GOOGLE_REFRESH_TOKEN: optional,
  GOOGLE_DRIVE_ROOT_FOLDER_ID: optional,

  STORAGE_MAX_FILE_SIZE: z.coerce.number().int().positive().default(500 * 1024 * 1024),
  LOCAL_STORAGE_DIR: z.string().default('./storage-data'),
  STORAGE_ALLOW_LOCAL: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),

  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  MAIL_FROM: z.string().default('Karaks Storage <ne-pas-repondre@karaks.local>'),
})

function load() {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')} : ${issue.message}`)
      .join('\n')
    throw new Error(`Configuration invalide :\n${details}`)
  }
  return parsed.data
}

export const env = load()

/** Google sert à deux choses distinctes : la connexion, et Google Drive. */
export const isGoogleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)

export const isEmailEnabled = Boolean(env.SMTP_HOST)

/** Adresse publique, sans barre finale : elle sert à construire les liens. */
export const appUrl = env.APP_URL.replace(/\/+$/, '')
