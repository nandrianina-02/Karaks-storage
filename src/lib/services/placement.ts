import type { StorageProvider as ProviderRow } from '@/generated/prisma/client'
import { ApiError } from '@/lib/api/errors'
import { prisma } from '@/lib/prisma'
import { alertAdmins, dashboardUrl } from '@/lib/services/email-notifications'
import { ensureDriveLayout, providerLabel, providerQuota, withProvider } from '@/lib/storage'
import { choisirAutre, depasseSeuil, type Espace } from '@/lib/services/placement-regles'

export { SEUIL_BASCULE } from '@/lib/services/placement-regles'

/**
 * Où ranger un nouveau fichier quand plusieurs stockages sont reliés.
 *
 * Un projet a son stockage, et ses fichiers y vont tant qu'il reste de la
 * place. Au-delà du seuil de bascule, les nouveaux fichiers partent sur le
 * stockage relié qui en a le plus : un deuxième compte Google, ou un
 * compartiment S3. Les fichiers déjà rangés ne bougent pas, et se lisent là
 * où ils sont (voir `fileProvider`) ; le projet garde son stockage, avec son
 * arborescence.
 *
 * Le seuil est à 80 % et non à 100 % : un compte Google gratuit partage ses
 * 15 Go avec Gmail et Photos, et un compte plein refuse aussi les emails de
 * son propriétaire.
 */

async function espace(row: ProviderRow): Promise<Espace | null> {
  const quota = await providerQuota(row).catch(() => null)
  return quota ? { id: row.id, usage: quota.usage, limit: quota.limit } : null
}

/** Le stockage relié qui a le plus de place sous le seuil, en dehors de `sauf`. */
async function meilleurAutre(sauf: string, taille: number): Promise<ProviderRow | null> {
  const autres = await prisma.storageProvider.findMany({
    where: { id: { not: sauf }, status: 'CONNECTED', kind: { in: ['GOOGLE_DRIVE', 'S3'] } },
  })
  const espaces = (await Promise.all(autres.map(espace))).filter((e): e is Espace => e !== null)
  const id = choisirAutre(espaces, taille)
  return autres.find((row) => row.id === id) ?? null
}

async function auDelaDuSeuil(row: ProviderRow, taille: number): Promise<boolean> {
  const e = await espace(row)
  return Boolean(e && depasseSeuil(e, taille))
}

/**
 * Dossier d'un projet dans un autre stockage, créé au premier fichier qui
 * y déborde : `projects/<slug>` dans ce compte-là. Les sous-dossiers du
 * projet n'y sont pas recréés ; l'arborescence vit dans la base.
 */
async function dossierDuProjet(project: { id: string; slug: string }, row: ProviderRow): Promise<string> {
  const connu = await prisma.projectStorageFolder.findUnique({
    where: { projectId_providerId: { projectId: project.id, providerId: row.id } },
  })
  if (connu) return connu.folderId
  const pret = row.kind === 'GOOGLE_DRIVE' ? await ensureDriveLayout(row) : row
  const folderId = await withProvider(pret, (storage) => storage.createFolder(project.slug, pret.projectsFolderId ?? null))
  await prisma.projectStorageFolder
    .create({ data: { projectId: project.id, providerId: row.id, folderId } })
    .catch(() => undefined)
  // Deux envois simultanés peuvent avoir créé chacun leur dossier : on garde
  // celui qui a été enregistré, l'autre reste vide.
  const retenu = await prisma.projectStorageFolder.findUnique({
    where: { projectId_providerId: { projectId: project.id, providerId: row.id } },
  })
  return retenu?.folderId ?? folderId
}

export interface Placement {
  provider: ProviderRow
  /** Dossier parent chez ce fournisseur. */
  parentId: string | null
}

/**
 * Le stockage d'un nouveau fichier de `project`. `parentId` est le dossier
 * voulu dans le stockage du projet ; en cas de bascule, le fichier va dans
 * le dossier du projet chez l'autre stockage.
 */
export async function placerFichier(
  project: { id: string; slug: string; provider: ProviderRow },
  taille: number,
  parentId: string | null,
): Promise<Placement> {
  const propre = await espace(project.provider)
  if (propre && !depasseSeuil(propre, taille)) return { provider: project.provider, parentId }

  // Un stockage dont on ne lit pas l'espace (accès illisibles, compte
  // déconnecté chez Google) refuserait l'envoi : un autre stockage relié le
  // reçoit, comme pour un compte plein.
  const autre = await meilleurAutre(project.provider.id, taille)
  if (!autre) {
    // Aucun autre stockage n'a de place : on reste, tant que le compte n'est
    // pas plein. Plein, l'envoi est refusé proprement plutôt qu'en route.
    const quota = await providerQuota(project.provider).catch(() => null)
    if (quota?.limit && quota.usage + taille > quota.limit) {
      throw new ApiError('quota_exceeded', 'L’espace du stockage est plein, et aucun autre stockage relié n’a de place.')
    }
    return { provider: project.provider, parentId }
  }
  // L'alerte parle d'un compte à 80 % : elle n'a pas lieu d'être pour un stockage illisible.
  if (propre) await annoncerBascule(project.provider, autre)
  return { provider: autre, parentId: await dossierDuProjet(project, autre) }
}

/** Stockage d'un nouveau projet : celui par défaut, sauf s'il a dépassé le seuil. */
export async function placerProjet(parDefaut: ProviderRow): Promise<ProviderRow> {
  if (!(await auDelaDuSeuil(parDefaut, 0))) return parDefaut
  const autre = await meilleurAutre(parDefaut.id, 0)
  if (!autre) return parDefaut
  await annoncerBascule(parDefaut, autre)
  return autre.kind === 'GOOGLE_DRIVE' ? ensureDriveLayout(autre) : autre
}

/** Prévient les super administrateurs, une fois par semaine au plus et par compte. */
async function annoncerBascule(plein: ProviderRow, suivant: ProviderRow) {
  await alertAdmins(
    `bascule:${plein.id}:${suivant.id}`,
    () => ({
      subject: `${providerLabel(plein)} a atteint 80 % : bascule sur ${providerLabel(suivant)}`,
      preheader: 'Les nouveaux fichiers changent de stockage, automatiquement.',
      title: 'Bascule automatique de stockage',
      paragraphs: [
        `${providerLabel(plein)} a dépassé 80 % de son espace. Les nouveaux fichiers vont désormais sur ${providerLabel(suivant)}, qui a le plus de place.`,
        'Les fichiers déjà rangés ne bougent pas et restent lisibles. Pour en libérer, vous pouvez déplacer un projet entier depuis les paramètres du stockage.',
      ],
      action: { label: 'Paramètres du stockage', url: dashboardUrl('/parametres?onglet=stockage') },
    }),
    { cooldownMs: 7 * 86_400_000 },
  ).catch(() => undefined)
}
