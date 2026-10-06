import type { StorageProvider as ProviderRow } from '@/generated/prisma/client'
import { env, isGoogleConfigured } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/security/crypto'
import { GoogleDriveProvider } from '@/lib/storage/google-drive'
import { LocalProvider } from '@/lib/storage/local'
import { ProviderError, type StorageProvider } from '@/lib/storage/provider'

/**
 * Registre des fournisseurs : fait le lien entre une ligne de la base et une
 * instance capable de lire et d'écrire.
 *
 * Les instances sont gardées en mémoire, avec leur jeton d'accès Google : en
 * recréer une à chaque requête obligerait à renouveler ce jeton à chaque
 * lecture, et Google limite ces renouvellements.
 */
const instances = new Map<string, { version: number; provider: StorageProvider }>()

export class StorageUnavailableError extends ProviderError {
  constructor(message: string) {
    super(message, 503)
    this.name = 'StorageUnavailableError'
  }
}

export function providerFor(row: ProviderRow): StorageProvider {
  const version = row.updatedAt.getTime()
  const cached = instances.get(row.id)
  if (cached && cached.version === version) return cached.provider

  let provider: StorageProvider
  if (row.kind === 'LOCAL') {
    if (process.env.NODE_ENV === 'production' && !env.STORAGE_ALLOW_LOCAL) {
      throw new StorageUnavailableError('Le stockage sur disque est désactivé en production.')
    }
    provider = new LocalProvider(env.LOCAL_STORAGE_DIR)
  } else {
    const refreshToken = row.credentials
      ? decrypt(row.credentials, env.ENCRYPTION_KEY)
      : env.GOOGLE_REFRESH_TOKEN
    if (!isGoogleConfigured || !refreshToken) {
      throw new StorageUnavailableError('Google Drive n’est pas connecté.')
    }
    provider = new GoogleDriveProvider({
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      refreshToken,
    })
  }

  instances.set(row.id, { version, provider })
  return provider
}

/**
 * Exécute une opération chez le fournisseur et, si Google retire l'accès,
 * passe le fournisseur en erreur : les réglages l'affichent alors, au lieu de
 * laisser chaque téléversement échouer sans explication.
 */
export async function withProvider<T>(
  row: ProviderRow,
  operation: (provider: StorageProvider) => Promise<T>,
): Promise<T> {
  try {
    return await operation(providerFor(row))
  } catch (error) {
    if (error instanceof ProviderError && error.authFailure) {
      await prisma.storageProvider
        .update({ where: { id: row.id }, data: { status: 'ERROR', lastError: error.message } })
        .catch(() => undefined)
      instances.delete(row.id)
    }
    throw error
  }
}

/**
 * Fournisseur attribué aux nouveaux projets : Google Drive s'il est relié,
 * sinon le disque local, admis seulement hors production.
 */
export async function defaultProvider(): Promise<ProviderRow> {
  const drive = await prisma.storageProvider.findFirst({
    where: { kind: 'GOOGLE_DRIVE', status: 'CONNECTED' },
    orderBy: { connectedAt: 'desc' },
  })
  if (drive) return ensureDriveLayout(drive)

  // Jeton fourni par l'environnement (CDS 30) : le fournisseur est créé au
  // premier besoin, sans passer par le bouton de connexion.
  if (env.GOOGLE_REFRESH_TOKEN && isGoogleConfigured) {
    const created = await prisma.storageProvider.create({
      data: {
        kind: 'GOOGLE_DRIVE',
        name: 'Google Drive',
        status: 'CONNECTED',
        connectedAt: new Date(),
        rootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? null,
      },
    })
    return ensureDriveLayout(created)
  }

  if (process.env.NODE_ENV !== 'production' || env.STORAGE_ALLOW_LOCAL) {
    const local = await prisma.storageProvider.findFirst({ where: { kind: 'LOCAL' } })
    return (
      local ??
      prisma.storageProvider.create({
        data: { kind: 'LOCAL', name: 'Disque local', status: 'CONNECTED', connectedAt: new Date() },
      })
    )
  }

  throw new StorageUnavailableError(
    'Aucun stockage n’est disponible : connectez Google Drive dans les réglages.',
  )
}

/**
 * Arborescence technique dans le Drive (CDS 8) :
 *
 *   KARAKS STORAGE
 *   ├── projects
 *   ├── temporary
 *   └── trash
 *
 * Créée une seule fois ; les identifiants sont conservés en base, le Drive
 * n'est plus parcouru ensuite.
 */
export async function ensureDriveLayout(row: ProviderRow): Promise<ProviderRow> {
  if (row.rootFolderId && row.projectsFolderId && row.temporaryFolderId && row.trashFolderId) {
    return row
  }
  return withProvider(row, async (provider) => {
    const rootFolderId = row.rootFolderId ?? (await provider.createFolder('KARAKS STORAGE', null))
    const projectsFolderId = row.projectsFolderId ?? (await provider.createFolder('projects', rootFolderId))
    const temporaryFolderId = row.temporaryFolderId ?? (await provider.createFolder('temporary', rootFolderId))
    const trashFolderId = row.trashFolderId ?? (await provider.createFolder('trash', rootFolderId))
    return prisma.storageProvider.update({
      where: { id: row.id },
      data: { rootFolderId, projectsFolderId, temporaryFolderId, trashFolderId },
    })
  })
}

/** Quota du fournisseur, gardé une minute : il est relu à chaque téléversement. */
const quotaCache = new Map<string, { at: number; limit: number | null; usage: number }>()

export async function providerQuota(row: ProviderRow) {
  const cached = quotaCache.get(row.id)
  if (cached && Date.now() - cached.at < 60_000) return cached
  const quota = await withProvider(row, (provider) => provider.quota())
  const entry = { at: Date.now(), limit: quota.limit, usage: quota.usage }
  quotaCache.set(row.id, entry)
  return entry
}

export function forgetQuota(rowId: string) {
  quotaCache.delete(rowId)
}
