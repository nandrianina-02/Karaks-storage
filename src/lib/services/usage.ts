import { prisma } from '@/lib/prisma'

/**
 * Compteurs d'usage (CDS 22).
 *
 * Écrire en base à chaque requête doublerait la charge de la base pour une
 * statistique : les compteurs s'accumulent en mémoire et partent par lot
 * toutes les quelques secondes, une ligne par projet et par jour. Un arrêt
 * brutal perd au plus ces quelques secondes, ce qui est acceptable pour des
 * statistiques — pas pour le journal d'audit, qui lui est écrit tout de suite.
 */
export interface UsageDelta {
  requests?: number
  streams?: number
  downloads?: number
  uploads?: number
  bytesOut?: number
  bytesIn?: number
}

const pending = new Map<string, Required<UsageDelta>>()
let timer: ReturnType<typeof setTimeout> | null = null

function dayOf(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export function recordUsage(projectId: string, delta: UsageDelta) {
  const key = `${projectId}|${dayOf()}`
  const current = pending.get(key) ?? {
    requests: 0,
    streams: 0,
    downloads: 0,
    uploads: 0,
    bytesOut: 0,
    bytesIn: 0,
  }
  for (const field of Object.keys(current) as (keyof UsageDelta)[]) {
    current[field] += delta[field] ?? 0
  }
  pending.set(key, current)
  if (!timer) timer = setTimeout(() => void flushUsage(), 5_000)
}

export async function flushUsage() {
  if (timer) clearTimeout(timer)
  timer = null
  const batch = [...pending.entries()]
  pending.clear()

  for (const [key, delta] of batch) {
    const [projectId, day] = key.split('|')
    try {
      await prisma.usageStat.upsert({
        where: { projectId_day: { projectId, day: new Date(`${day}T00:00:00Z`) } },
        create: {
          projectId,
          day: new Date(`${day}T00:00:00Z`),
          ...delta,
          bytesOut: BigInt(delta.bytesOut),
          bytesIn: BigInt(delta.bytesIn),
        },
        update: {
          requests: { increment: delta.requests },
          streams: { increment: delta.streams },
          downloads: { increment: delta.downloads },
          uploads: { increment: delta.uploads },
          bytesOut: { increment: BigInt(delta.bytesOut) },
          bytesIn: { increment: BigInt(delta.bytesIn) },
        },
      })
    } catch (error) {
      // Projet supprimé entre-temps, ou base indisponible : la statistique
      // est perdue, la requête de l'utilisateur, elle, a abouti.
      console.error('[usage]', error instanceof Error ? error.message : error)
    }
  }
}
