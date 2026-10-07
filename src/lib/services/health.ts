import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { rateLimitBackend } from '@/lib/security/rate-limit'
import { providerQuota } from '@/lib/storage'
import { MAX_ATTEMPTS } from '@/lib/services/webhooks'

/**
 * Supervision (CDS V2) : l'état de chaque composant dont dépend le service.
 *
 * Deux lectures : la page de supervision, réservée au super administrateur,
 * voit le détail (erreurs, comptes, configuration) ; la page de statut
 * publique ne voit que des niveaux, sans rien qui renseigne sur l'intérieur.
 */
export type Level = 'ok' | 'degraded' | 'down'

export interface ComponentCheck {
  id: string
  label: string
  level: Level
  /** Détail technique : jamais renvoyé par la page publique. */
  detail: string
  latencyMs?: number
}

const QUOTA_TIMEOUT_MS = 5000
/** Une tâche quotidienne qui n'a pas tourné depuis 36 heures a sauté une nuit. */
const CRON_LATE_MS = 36 * 3_600_000

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Pas de réponse en ${ms / 1000} s`)), ms))])
}

export async function checkDatabase(): Promise<ComponentCheck> {
  const started = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    const latencyMs = Date.now() - started
    return { id: 'database', label: 'Base de données', level: latencyMs > 1500 ? 'degraded' : 'ok', detail: `Répond en ${latencyMs} ms`, latencyMs }
  } catch (error) {
    return { id: 'database', label: 'Base de données', level: 'down', detail: error instanceof Error ? error.message : 'Injoignable' }
  }
}

/** Un contrôle par fournisseur qui porte au moins un projet. */
export async function checkProviders(): Promise<ComponentCheck[]> {
  const providers = await prisma.storageProvider.findMany({ where: { projects: { some: {} } }, orderBy: { createdAt: 'asc' } })
  return Promise.all(
    providers.map(async (provider): Promise<ComponentCheck> => {
      const base = { id: `provider:${provider.id}`, label: provider.kind === 'GOOGLE_DRIVE' ? 'Stockage Google Drive' : `Stockage ${provider.name}` }
      if (provider.status !== 'CONNECTED') {
        return { ...base, level: 'down', detail: provider.lastError ?? 'Fournisseur déconnecté : à relier depuis les paramètres.' }
      }
      const started = Date.now()
      try {
        const quota = await within(providerQuota(provider), QUOTA_TIMEOUT_MS)
        const latencyMs = Date.now() - started
        const percent = quota.limit ? (quota.usage / quota.limit) * 100 : null
        return {
          ...base,
          // Un compte presque plein refusera bientôt les envois : c'est une
          // dégradation à voir avant qu'elle ne devienne une panne.
          level: percent !== null && percent >= 95 ? 'degraded' : 'ok',
          detail: `${provider.accountEmail ?? provider.name}${percent !== null ? ` · ${Math.round(percent)} % de l’espace utilisé` : ''}`,
          latencyMs,
        }
      } catch (error) {
        return { ...base, level: 'degraded', detail: error instanceof Error ? error.message : 'Le fournisseur ne répond pas.' }
      }
    }),
  )
}

export async function checkMaintenance(): Promise<ComponentCheck> {
  const last = await prisma.maintenanceRun.findFirst({ where: { trigger: 'cron' }, orderBy: { startedAt: 'desc' } })
  const base = { id: 'maintenance', label: 'Tâches automatiques' }
  if (!env.CRON_SECRET) return { ...base, level: 'degraded', detail: 'CRON_SECRET absent : la tâche planifiée ne peut pas s’authentifier.' }
  if (!last) return { ...base, level: 'ok', detail: 'Aucun passage planifié pour l’instant.' }
  if (last.error) return { ...base, level: 'degraded', detail: `Dernier passage en erreur : ${last.error}` }
  if (Date.now() - last.startedAt.getTime() > CRON_LATE_MS) return { ...base, level: 'degraded', detail: 'Pas de passage planifié depuis plus de 36 heures.' }
  return { ...base, level: 'ok', detail: `Dernier passage le ${last.startedAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}` }
}

export async function checkWebhooks(): Promise<ComponentCheck & { stats: WebhookStats }> {
  const stats = await webhookStats()
  const base = { id: 'webhooks', label: 'Webhooks' }
  const failureRate = stats.total ? stats.failed / stats.total : 0
  return {
    ...base,
    // Les échecs d'un webhook tiennent souvent au serveur qui le reçoit : on
    // signale une dégradation, jamais une panne du service lui-même.
    level: stats.total >= 10 && failureRate > 0.25 ? 'degraded' : 'ok',
    detail: `${stats.total} envoi${stats.total > 1 ? 's' : ''} en 24 h, ${stats.failed} en échec, ${stats.pending} relance${stats.pending > 1 ? 's' : ''} prévue${stats.pending > 1 ? 's' : ''}`,
    stats,
  }
}

export interface WebhookStats {
  total: number
  failed: number
  pending: number
  abandoned: number
}

async function webhookStats(): Promise<WebhookStats> {
  const since = new Date(Date.now() - 86_400_000)
  const [total, failed, pending, abandoned] = await Promise.all([
    prisma.webhookDelivery.count({ where: { createdAt: { gte: since } } }),
    prisma.webhookDelivery.count({ where: { createdAt: { gte: since }, success: false } }),
    prisma.webhookDelivery.count({ where: { nextAttemptAt: { not: null } } }),
    prisma.webhookDelivery.count({ where: { createdAt: { gte: since }, success: false, nextAttemptAt: null, attempt: { gte: MAX_ATTEMPTS } } }),
  ])
  return { total, failed, pending, abandoned }
}

export function overallLevel(checks: { level: Level }[]): Level {
  if (checks.some((check) => check.level === 'down')) return 'down'
  if (checks.some((check) => check.level === 'degraded')) return 'degraded'
  return 'ok'
}

/** Vue complète, pour la page de supervision. */
export async function supervision() {
  const [database, providers, maintenance, webhooks, runs, failures, uploads] = await Promise.all([
    checkDatabase(),
    checkProviders(),
    checkMaintenance(),
    checkWebhooks(),
    prisma.maintenanceRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
    prisma.webhookDelivery.findMany({
      where: { success: false, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { webhook: { select: { url: true, project: { select: { name: true } } } } },
    }),
    prisma.uploadSession.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  const checks: ComponentCheck[] = [database, ...providers, maintenance, webhooks]
  return {
    level: overallLevel(checks),
    checks,
    webhookStats: webhooks.stats,
    runs,
    failures,
    uploads: Object.fromEntries(uploads.map((row) => [row.status, row._count._all])) as Record<string, number>,
    config: {
      rateLimit: rateLimitBackend(),
      cron: Boolean(env.CRON_SECRET),
      mail: Boolean(env.SMTP_HOST),
      region: process.env.VERCEL_REGION ?? null,
    },
    checkedAt: new Date(),
  }
}

/**
 * Vue publique : niveaux seuls, par grande fonction du service. Les
 * fournisseurs sont fondus en un seul « stockage » ; ni compte, ni erreur, ni
 * latence ne sortent.
 */
export async function publicStatus() {
  const [database, providers] = await Promise.all([checkDatabase(), checkProviders()])
  const storage = overallLevel(providers)
  const components = [
    { id: 'api', label: 'API et tableau de bord', level: database.level },
    { id: 'storage', label: 'Stockage et diffusion des fichiers', level: overallLevel([database, { level: storage }]) },
    { id: 'links', label: 'Liens temporaires', level: overallLevel([database, { level: storage }]) },
  ]
  return { level: overallLevel(components), components, checkedAt: new Date().toISOString() }
}
