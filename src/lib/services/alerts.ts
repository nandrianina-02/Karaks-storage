import { track } from '@/lib/background'
import { env } from '@/lib/env'
import { formatBytes } from '@/lib/files/types'
import { formatWhen } from '@/lib/mail/template'
import { prisma } from '@/lib/prisma'
import { alertAdmins, clearAlert, dashboardUrl } from '@/lib/services/email-notifications'
import { providerLabel, providerQuota } from '@/lib/storage'

/**
 * Alertes d'exploitation par email (catégorie « exploitation »). Chacune ne
 * part qu'une fois par situation : un quota dépassé n'envoie pas un email par
 * nuit, mais un email au passage de 80 %, un autre à 95 %, et se réarme quand
 * l'espace redescend.
 */
const DAY = 86_400_000
const when = () => formatWhen(new Date(), env.APP_TIMEZONE)

function level(percent: number) {
  return percent >= 95 ? 95 : percent >= 80 ? 80 : 0
}

/** Quota d'un projet : appelé après chaque envoi, au plus toutes les dix minutes par projet. */
const lastProjectCheck = new Map<string, number>()

export function checkProjectQuotaSoon(projectId: string) {
  const last = lastProjectCheck.get(projectId) ?? 0
  if (Date.now() - last < 10 * 60_000) return
  lastProjectCheck.set(projectId, Date.now())
  track(checkProjectQuota(projectId).catch((error: unknown) => console.error('[alerte]', error instanceof Error ? error.message : error)))
}

export async function checkProjectQuota(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, storageQuota: true } })
  if (!project?.storageQuota) return
  const used = Number((await prisma.file.aggregate({ where: { projectId, status: { in: ['ACTIVE', 'TRASHED'] } }, _sum: { size: true } }))._sum.size ?? 0)
  const limit = Number(project.storageQuota)
  const percent = (used / limit) * 100
  const key = `quota:projet:${project.id}`
  const reached = level(percent)
  if (reached === 0) return clearAlert(key)
  await alertAdmins(
    key,
    () => ({
      subject: `${project.name} : stockage utilisé à ${Math.round(percent)} %`,
      preheader: `${formatBytes(used)} sur ${formatBytes(limit)}.`,
      title: reached === 95 ? `${project.name} est presque plein` : `${project.name} approche de son quota`,
      paragraphs: [
        `Le projet utilise ${Math.round(percent)} % de son quota. Au-delà de 100 %, les nouveaux envois sont refusés avec l’erreur 507 ; la lecture des fichiers continue.`,
        'Pour libérer de la place : vider la corbeille, supprimer des fichiers inutiles, ou demander au super administrateur une offre supérieure.',
      ],
      details: [
        ['Utilisé', formatBytes(used)],
        ['Quota', formatBytes(limit)],
        ['Relevé le', when()],
      ],
      action: { label: 'Voir les fichiers', url: dashboardUrl('/fichiers') },
    }),
    { level: reached, projectId: project.id },
  )
}

/** Espace des comptes de stockage (Google Drive : 15 Go partagés avec Gmail). */
export async function checkProviderSpace() {
  const providers = await prisma.storageProvider.findMany({ where: { status: 'CONNECTED', kind: 'GOOGLE_DRIVE' } })
  for (const provider of providers) {
    await clearAlert(`fournisseur:${provider.id}:erreur`)
    const quota = await providerQuota(provider).catch(() => null)
    if (!quota?.limit) continue
    const percent = (quota.usage / quota.limit) * 100
    const key = `quota:fournisseur:${provider.id}`
    const reached = level(percent)
    if (reached === 0) {
      await clearAlert(key)
      continue
    }
    await alertAdmins(
      key,
      () => ({
        subject: `${providerLabel(provider)} rempli à ${Math.round(percent)} %`,
        preheader: `${formatBytes(quota.usage)} sur ${formatBytes(quota.limit!)}.`,
        title: `L’espace de ${providerLabel(provider)} s’épuise`,
        paragraphs: [
          `Le compte de stockage ${provider.accountEmail ?? ''} est rempli à ${Math.round(percent)} %. Plein, il refusera tous les envois, de tous les projets qu’il porte.`,
          'Pour Google Drive, l’espace est partagé avec Gmail et Google Photos de ce compte. Solutions : libérer de la place, prendre un abonnement plus grand, ou déplacer des projets vers un stockage S3 depuis les paramètres.',
        ],
        details: [
          ['Utilisé', formatBytes(quota.usage)],
          ['Capacité', formatBytes(quota.limit!)],
          ['Relevé le', when()],
        ],
        action: { label: 'Paramètres du stockage', url: dashboardUrl('/parametres?onglet=stockage') },
      }),
      { level: reached },
    )
  }
}

/** Le fournisseur a refusé l'accès : plus aucun envoi ni lecture ne passe. */
export async function alertProviderError(provider: { id: string; kind: 'GOOGLE_DRIVE' | 'LOCAL' | 'S3'; name: string }, message: string) {
  await alertAdmins(
    `fournisseur:${provider.id}:erreur`,
    () => ({
      subject: `Urgent : ${providerLabel(provider)} n’est plus accessible`,
      preheader: 'Les envois et les lectures de fichiers échouent.',
      title: `${providerLabel(provider)} a refusé l’accès`,
      paragraphs: [
        'Le service ne peut plus lire ni écrire chez ce fournisseur : les envois échouent, et les fichiers qu’il porte ne se lisent plus.',
        'Pour Google Drive, il suffit en général de reconnecter le compte depuis les paramètres (autorisation retirée, mot de passe changé, application en test expirée).',
      ],
      details: [
        ['Erreur', message],
        ['Constatée le', when()],
      ],
      action: { label: 'Reconnecter le stockage', url: dashboardUrl('/parametres?onglet=stockage') },
    }),
    { cooldownMs: DAY },
  )
}

export async function alertMaintenanceErrors(errors: string[]) {
  if (errors.length === 0) return clearAlert('maintenance:erreurs')
  await alertAdmins(
    'maintenance:erreurs',
    () => ({
      subject: `Maintenance : ${errors.length} erreur${errors.length > 1 ? 's' : ''}`,
      preheader: errors[0],
      title: 'La maintenance de nuit a rencontré des erreurs',
      paragraphs: [
        'Le passage s’est poursuivi, mais certaines opérations ont échoué. Elles seront retentées au prochain passage ; si l’erreur se répète, elle demande une intervention.',
      ],
      details: errors.slice(0, 6).map((error, index) => [`Erreur ${index + 1}`, error] as [string, string]),
      action: { label: 'Ouvrir la supervision', url: dashboardUrl('/supervision') },
    }),
    { cooldownMs: 20 * 3_600_000 },
  )
}

/** Un webhook a épuisé ses cinq tentatives : l'événement est perdu pour l'application. */
export async function alertWebhookAbandoned(hook: { id: string; url: string; projectId: string }, event: string, error: string) {
  const project = await prisma.project.findUnique({ where: { id: hook.projectId }, select: { name: true } })
  await alertAdmins(
    `webhook:${hook.id}`,
    () => ({
      subject: `${project?.name ?? 'Projet'} : un webhook ne répond plus`,
      preheader: `${event} non remis après cinq tentatives.`,
      title: 'Un webhook a été abandonné après cinq tentatives',
      paragraphs: [
        `L’événement ${event} n’a pas pu être remis à l’adresse du webhook, malgré les relances étalées sur plusieurs heures. L’application qui l’écoute a manqué cet événement.`,
        'Vérifiez que le serveur destinataire répond, puis envoyez un événement d’essai depuis la page Webhooks.',
      ],
      details: [
        ['Adresse', hook.url],
        ['Dernière erreur', error],
        ['Le', when()],
      ],
      action: { label: 'Voir les webhooks', url: dashboardUrl('/webhooks') },
    }),
    { projectId: hook.projectId, superAdmins: false, cooldownMs: DAY },
  )
}
