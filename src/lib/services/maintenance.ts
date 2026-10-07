import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import type { Actor } from '@/lib/services/audit'
import { deleteFilePermanently } from '@/lib/services/files'
import { alertMaintenanceErrors, checkProjectQuota, checkProviderSpace } from '@/lib/services/alerts'
import { advanceMigrations } from '@/lib/services/storage-migration'
import { abortUpload } from '@/lib/services/uploads'
import { retryDueDeliveries } from '@/lib/services/webhooks'

/**
 * Maintenance automatique (CDS 21, 37) :
 *
 * - corbeille : un fichier y passe au plus `trashRetentionDays` jours, puis
 *   il est supprimé définitivement, chez le fournisseur comme en base ;
 * - envois abandonnés : une session reprenable expirée est fermée chez le
 *   fournisseur, qui sinon garderait les octets reçus ;
 * - webhooks : les envois en échec sont relancés à l'heure prévue ;
 * - historique des webhooks : les envois de plus de trente jours sont retirés ;
 * - changements de stockage : les migrations en cours avancent avec le temps
 *   qui reste.
 *
 * Chaque passage est borné dans le temps : une fonction Vercel ne vit pas plus
 * de soixante secondes, et ce qui n'est pas fait le sera au passage suivant.
 */
const SYSTEM: Actor = { userId: null, apiKeyId: null, ip: null, userAgent: 'maintenance' }
const DELIVERY_HISTORY_DAYS = 30

export interface MaintenanceReport {
  trashPurged: number
  uploadsAborted: number
  webhooksRetried: number
  deliveriesPruned: number
  migrationsAdvanced: number
  incomplete: boolean
  errors: string[]
}

export async function runMaintenance(trigger: 'cron' | 'manuel', budgetMs = 45_000): Promise<MaintenanceReport> {
  const started = Date.now()
  const over = () => Date.now() - started > budgetMs
  const run = await prisma.maintenanceRun.create({ data: { trigger } })
  const report: MaintenanceReport = {
    trashPurged: 0,
    uploadsAborted: 0,
    webhooksRetried: 0,
    deliveriesPruned: 0,
    migrationsAdvanced: 0,
    incomplete: false,
    errors: [],
  }

  try {
    // --- Corbeille, projet par projet (chacun a sa durée de conservation) ---
    const projects = await prisma.project.findMany({ include: { provider: true } })
    for (const project of projects) {
      if (over()) break
      const limit = new Date(Date.now() - project.trashRetentionDays * 86_400_000)
      const expired = await prisma.file.findMany({
        where: { projectId: project.id, status: 'TRASHED', trashedAt: { lt: limit } },
        select: { publicId: true },
        take: 50,
      })
      for (const file of expired) {
        if (over()) break
        try {
          await deleteFilePermanently(project, file.publicId, SYSTEM)
          report.trashPurged += 1
        } catch (error) {
          report.errors.push(`Corbeille ${file.publicId} : ${error instanceof Error ? error.message : 'échec'}`)
        }
      }
    }

    // --- Envois reprenables expirés ---
    if (!over()) {
      const stale = await prisma.uploadSession.findMany({
        where: { status: 'PENDING', expiresAt: { lt: new Date() } },
        include: { project: { include: { provider: true } } },
        take: 100,
      })
      for (const session of stale) {
        if (over()) break
        await abortUpload(session.project, session.publicId).catch((error: unknown) => {
          report.errors.push(`Envoi ${session.publicId} : ${error instanceof Error ? error.message : 'échec'}`)
        })
        report.uploadsAborted += 1
      }
    }

    // --- Webhooks en attente de relance ---
    if (!over()) report.webhooksRetried = await retryDueDeliveries(50)

    // --- Historique des webhooks ---
    if (!over()) {
      const pruned = await prisma.webhookDelivery.deleteMany({
        where: {
          createdAt: { lt: new Date(Date.now() - DELIVERY_HISTORY_DAYS * 86_400_000) },
          nextAttemptAt: null,
        },
      })
      report.deliveriesPruned = pruned.count
    }

    // --- Changements de stockage en cours ---
    if (!over()) report.migrationsAdvanced = await advanceMigrations(budgetMs - (Date.now() - started))

    // --- Alertes d'espace : quotas des projets, comptes de stockage ---
    if (!over()) {
      try {
        for (const project of await prisma.project.findMany({ where: { storageQuota: { not: null } }, select: { id: true } })) {
          await checkProjectQuota(project.id)
        }
        await checkProviderSpace()
      } catch (error) {
        report.errors.push(`Alertes d’espace : ${error instanceof Error ? error.message : 'échec'}`)
      }
    }

    report.incomplete = over()
    await prisma.maintenanceRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), report: report as unknown as Prisma.InputJsonValue },
    })
    // Un passage manuel ne prévient pas : celui qui l'a lancé voit le résultat.
    if (trigger === 'cron') await alertMaintenanceErrors(report.errors).catch(() => undefined)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Échec de la maintenance'
    await prisma.maintenanceRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), error: message } })
    if (trigger === 'cron') await alertMaintenanceErrors([message]).catch(() => undefined)
    throw error
  }
  return report
}

/**
 * Relances légères, entre deux passages complets : à chaque requête, au plus
 * une fois par minute et par instance. Avec un passage complet par jour (la
 * limite des tâches planifiées sur l'offre gratuite de Vercel), un webhook
 * en échec attendrait sinon le lendemain.
 */
let lastPump = 0
export async function pumpRetries() {
  const now = Date.now()
  if (now - lastPump < 60_000) return
  lastPump = now
  await retryDueDeliveries(10).catch(() => undefined)
}
