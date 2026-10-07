import type { ProjectWithProvider } from '@/lib/api/context'
import { prisma } from '@/lib/prisma'
import { flushUsage } from '@/lib/services/usage'
import { providerLabel, providerQuota } from '@/lib/storage'

/**
 * Statistiques d'un projet (CDS 6.1, 22).
 *
 * Les variations comparent le mois en cours à la même période du mois
 * précédent : comparer dix jours d'octobre à un septembre complet donnerait
 * une baisse trompeuse chaque début de mois.
 */
function utcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000)
}

export function variation(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 100)
}

async function sumUsage(projectId: string, from: Date, to: Date) {
  const result = await prisma.usageStat.aggregate({
    where: { projectId, day: { gte: from, lt: to } },
    _sum: { requests: true, streams: true, downloads: true, uploads: true, bytesOut: true, bytesIn: true },
  })
  return {
    requests: result._sum.requests ?? 0,
    streams: result._sum.streams ?? 0,
    downloads: result._sum.downloads ?? 0,
    uploads: result._sum.uploads ?? 0,
    bytesOut: Number(result._sum.bytesOut ?? 0),
    bytesIn: Number(result._sum.bytesIn ?? 0),
  }
}

export async function storageUsed(projectId: string) {
  const [sum, files, trashed] = await Promise.all([
    prisma.file.aggregate({
      where: { projectId, status: { in: ['ACTIVE', 'TRASHED'] } },
      _sum: { size: true },
    }),
    prisma.file.count({ where: { projectId, status: 'ACTIVE' } }),
    prisma.file.count({ where: { projectId, status: 'TRASHED' } }),
  ])
  return { bytes: Number(sum._sum.size ?? 0), files, trashed }
}

export async function projectOverview(project: ProjectWithProvider) {
  // Les compteurs en attente partent d'abord : sans cela, la page afficherait
  // un retard de quelques secondes sur l'activité qu'on vient de produire.
  await flushUsage()

  const now = new Date()
  const today = utcDay(now)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const previousStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const elapsed = today.getTime() - monthStart.getTime() + 86_400_000
  const previousEnd = new Date(Math.min(previousStart.getTime() + elapsed, monthStart.getTime()))

  const [storage, month, previous, quota] = await Promise.all([
    storageUsed(project.id),
    sumUsage(project.id, monthStart, addDays(today, 1)),
    sumUsage(project.id, previousStart, previousEnd),
    providerQuota(project.provider).catch(() => null),
  ])

  const filesThisMonth = await prisma.file.count({
    where: { projectId: project.id, status: 'ACTIVE', createdAt: { gte: monthStart } },
  })
  const filesPrevious = await prisma.file.count({
    where: { projectId: project.id, status: 'ACTIVE', createdAt: { gte: previousStart, lt: previousEnd } },
  })

  const limit = project.storageQuota !== null ? Number(project.storageQuota) : quota?.limit ?? null

  return {
    storage: { used: storage.bytes, limit, files: storage.files, trashed: storage.trashed },
    provider: {
      kind: project.provider.kind,
      label: providerLabel(project.provider),
      status: project.provider.status,
      account: project.provider.accountEmail,
      usage: quota?.usage ?? null,
      limit: quota?.limit ?? null,
    },
    month: {
      ...month,
      filesAdded: filesThisMonth,
      change: {
        files: variation(filesThisMonth, filesPrevious),
        bytesOut: variation(month.bytesOut, previous.bytesOut),
        requests: variation(month.requests, previous.requests),
        streams: variation(month.streams, previous.streams),
        downloads: variation(month.downloads, previous.downloads),
      },
    },
  }
}

/** Série quotidienne : activité du jour, et volume stocké en fin de journée. */
export async function dailySeries(projectId: string, days: number) {
  await flushUsage()
  const today = utcDay(new Date())
  const from = addDays(today, -(days - 1))

  const [usage, files, before] = await Promise.all([
    prisma.usageStat.findMany({ where: { projectId, day: { gte: from } }, orderBy: { day: 'asc' } }),
    prisma.file.findMany({
      where: { projectId, status: { in: ['ACTIVE', 'TRASHED'] }, createdAt: { gte: from } },
      select: { size: true, createdAt: true },
    }),
    prisma.file.aggregate({
      where: { projectId, status: { in: ['ACTIVE', 'TRASHED'] }, createdAt: { lt: from } },
      _sum: { size: true },
    }),
  ])

  const byDay = new Map(usage.map((row) => [row.day.toISOString().slice(0, 10), row]))
  let stored = Number(before._sum.size ?? 0)

  return Array.from({ length: days }, (_, index) => {
    const day = addDays(from, index)
    const key = day.toISOString().slice(0, 10)
    const next = addDays(day, 1)
    stored += files
      .filter((file) => file.createdAt >= day && file.createdAt < next)
      .reduce((total, file) => total + Number(file.size), 0)
    const row = byDay.get(key)
    return {
      day: key,
      stored,
      requests: row?.requests ?? 0,
      streams: row?.streams ?? 0,
      downloads: row?.downloads ?? 0,
      uploads: row?.uploads ?? 0,
      bytesOut: Number(row?.bytesOut ?? 0),
    }
  })
}

export async function topFiles(projectId: string, take = 5) {
  const files = await prisma.file.findMany({
    where: { projectId, status: 'ACTIVE', OR: [{ streamCount: { gt: 0 } }, { downloadCount: { gt: 0 } }] },
    orderBy: [{ streamCount: 'desc' }, { downloadCount: 'desc' }],
    take,
    include: { folder: { select: { publicId: true } } },
  })
  return files
}

export async function monthlySeries(projectId: string, months: number) {
  await flushUsage()
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))
  const rows = await prisma.usageStat.findMany({ where: { projectId, day: { gte: start } } })
  return Array.from({ length: months }, (_, index) => {
    const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1))
    const key = month.toISOString().slice(0, 7)
    const inMonth = rows.filter((row) => row.day.toISOString().startsWith(key))
    return {
      month: key,
      requests: inMonth.reduce((total, row) => total + row.requests, 0),
      streams: inMonth.reduce((total, row) => total + row.streams, 0),
      downloads: inMonth.reduce((total, row) => total + row.downloads, 0),
      bytesOut: inMonth.reduce((total, row) => total + Number(row.bytesOut), 0),
    }
  })
}
