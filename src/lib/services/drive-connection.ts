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

  /**
   * Plusieurs comptes Google peuvent être reliés, chacun son stockage.
   *
   * Le compte choisi sur l'écran de Google décide de ce qui se passe : déjà
   * relié, il est simplement reconnecté (nouveau jeton) ; nouveau, il
   * s'ajoute aux autres. Aucun compte n'en remplace un autre : avec le droit
   * `drive.file`, l'application ne voit que les fichiers qu'elle a créés dans
   * chaque compte, et en changer rendrait les précédents illisibles.
   *
   * Seule exception, un stockage Drive encore anonyme (relié avant que
   * l'adresse du compte ne soit retenue) et vide : il est repris.
   */
  const memeCompte = grant.email
    ? await prisma.storageProvider.findFirst({ where: { kind: 'GOOGLE_DRIVE', accountEmail: grant.email } })
    : null
  const anonymeVide = memeCompte
    ? null
    : await prisma.storageProvider.findFirst({
        where: { kind: 'GOOGLE_DRIVE', accountEmail: null, projects: { none: {} }, files: { none: {} } },
      })
  const existing = memeCompte ?? anonymeVide

  const data = {
    name: 'Google Drive',
    status: 'CONNECTED' as const,
    accountEmail: grant.email,
    credentials: encrypt(grant.refreshToken, env.ENCRYPTION_KEY),
    connectedAt: new Date(),
    lastError: null,
  }
  // Le dossier racine imposé par l'environnement ne vaut que pour le premier
  // compte : un autre compte n'y a pas accès.
  const premier = (await prisma.storageProvider.count({ where: { kind: 'GOOGLE_DRIVE' } })) === 0
  const provider = existing
    ? await prisma.storageProvider.update({ where: { id: existing.id }, data })
    : await prisma.storageProvider.create({
        data: { kind: 'GOOGLE_DRIVE', ...data, rootFolderId: premier ? env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? null : null },
      })

  const ready = await ensureDriveLayout(provider)
  await audit(actor, { action: 'CONNECT_PROVIDER', target: grant.email ?? 'Google Drive' })
  return ready
}
