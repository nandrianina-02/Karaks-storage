import { ApiError } from '@/lib/api/errors'
import { appUrl, env, isGoogleConfigured } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { audit, type Actor } from '@/lib/services/audit'
import { encrypt } from '@/lib/security/crypto'
import { ensureDriveLayout } from '@/lib/storage'
import { exchangeGoogleCode, googleDriveAuthUrl } from '@/lib/storage/google-drive'

/**
 * Connexion du compte Google Drive (CDS 36 : « Google Drive connecté »).
 *
 * Le jeton de rafraîchissement est obtenu par une autorisation OAuth faite
 * depuis les réglages, puis chiffré en base. C'est l'alternative à
 * `GOOGLE_REFRESH_TOKEN` (CDS 30) qui évite de manipuler le jeton à la main.
 */
export const DRIVE_STATE_COOKIE = 'karaks-storage.drive-state'
export const driveRedirectUri = `${appUrl}/api/v1/storage/google/callback`

export function driveConnectUrl(state: string) {
  if (!isGoogleConfigured) {
    throw new ApiError('storage_unavailable', 'Renseignez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET pour relier Google Drive.')
  }
  return googleDriveAuthUrl({ clientId: env.GOOGLE_CLIENT_ID!, redirectUri: driveRedirectUri, state })
}

export async function completeDriveConnection(code: string, actor: Actor) {
  const grant = await exchangeGoogleCode({
    clientId: env.GOOGLE_CLIENT_ID!,
    clientSecret: env.GOOGLE_CLIENT_SECRET!,
    redirectUri: driveRedirectUri,
    code,
  })
  if (!grant.scope.includes('https://www.googleapis.com/auth/drive.file')) {
    throw new ApiError('forbidden', 'L’accès à Google Drive n’a pas été accordé : cochez-le sur l’écran de Google.')
  }

  const existing = await prisma.storageProvider.findFirst({
    where: { kind: 'GOOGLE_DRIVE' },
    include: { _count: { select: { projects: true } } },
  })

  // Avec le droit `drive.file`, l'application ne voit que les fichiers
  // qu'elle a créés dans ce compte-là : relier un autre compte rendrait
  // illisibles tous les fichiers déjà stockés.
  if (
    existing?.accountEmail &&
    grant.email &&
    existing.accountEmail !== grant.email &&
    existing._count.projects > 0
  ) {
    throw new ApiError(
      'conflict',
      `Des projets sont stockés sur ${existing.accountEmail} : reconnectez ce même compte.`,
    )
  }

  const data = {
    name: 'Google Drive',
    status: 'CONNECTED' as const,
    accountEmail: grant.email,
    credentials: encrypt(grant.refreshToken, env.ENCRYPTION_KEY),
    connectedAt: new Date(),
    lastError: null,
  }
  const sameAccount = existing && (!existing.accountEmail || existing.accountEmail === grant.email)
  const provider = existing
    ? await prisma.storageProvider.update({
        where: { id: existing.id },
        data: sameAccount
          ? data
          : { ...data, rootFolderId: null, projectsFolderId: null, temporaryFolderId: null, trashFolderId: null },
      })
    : await prisma.storageProvider.create({
        data: { kind: 'GOOGLE_DRIVE', ...data, rootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? null },
      })

  const ready = await ensureDriveLayout(provider)
  await audit(actor, { action: 'CONNECT_PROVIDER', target: grant.email ?? 'Google Drive' })
  return ready
}
