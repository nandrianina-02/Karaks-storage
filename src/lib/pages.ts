import type { ProviderInfo } from '@/components/files/file-panel'
import type { ProjectWithProvider } from '@/lib/api/context'
import { dailySeries } from '@/lib/services/stats'
import { formatDay } from '@/lib/utils'

/** Utilitaires partagés par les pages du tableau de bord. */

export type SearchParams = Promise<Record<string, string | string[] | undefined>>

export function param(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

/** Début de la fenêtre des `days` derniers jours. */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}

export function periodOf(value: string | undefined, fallback = 7): number {
  const days = Number(value)
  return [7, 30, 90].includes(days) ? days : fallback
}

export function providerInfo(project: ProjectWithProvider): ProviderInfo {
  return {
    kind: project.provider.kind,
    label: project.provider.kind === 'GOOGLE_DRIVE' ? 'Google Drive' : 'Disque local (développement)',
  }
}

const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

/** Séries quotidiennes prêtes pour les graphiques. */
export async function chartSeries(projectId: string, days: number) {
  const series = await dailySeries(projectId, days)
  const point = (day: string, value: number) => ({
    label: formatDay(`${day}T12:00:00Z`),
    detail: longDay.format(new Date(`${day}T12:00:00Z`)),
    value,
  })
  return {
    stored: series.map((row) => point(row.day, row.stored)),
    bytesOut: series.map((row) => point(row.day, row.bytesOut)),
    streams: series.map((row) => point(row.day, row.streams)),
    downloads: series.map((row) => point(row.day, row.downloads)),
    requests: series.map((row) => point(row.day, row.requests)),
    uploads: series.map((row) => point(row.day, row.uploads)),
  }
}
