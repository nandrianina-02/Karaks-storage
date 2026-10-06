import { z } from 'zod'

import type { AuditAction, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { AUDIT_LABELS } from '@/lib/services/audit'

/** Consultation du journal d'audit (CDS 23). */
const ACTIONS = Object.keys(AUDIT_LABELS) as [AuditAction, ...AuditAction[]]

export const logsQuery = z.object({
  action: z.enum(ACTIONS).optional(),
  result: z.enum(['SUCCESS', 'FAILURE']).optional(),
  fileId: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function listLogs(projectId: string, query: z.infer<typeof logsQuery>) {
  const where: Prisma.AuditLogWhereInput = {
    projectId,
    action: query.action,
    result: query.result,
    fileId: query.fileId,
    ...(query.search ? { target: { contains: query.search, mode: 'insensitive' } } : {}),
  }
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.auditLog.count({ where }),
  ])

  // Les noms des clés sont lus à part : la clé peut avoir été supprimée
  // depuis, le journal garde alors son identifiant seul.
  const keyIds = [...new Set(items.map((item) => item.apiKeyId).filter((id): id is string => Boolean(id)))]
  const keys = keyIds.length
    ? await prisma.apiKey.findMany({ where: { id: { in: keyIds } }, select: { id: true, name: true, prefix: true } })
    : []
  const keyNames = new Map(keys.map((key) => [key.id, `${key.name} (${key.prefix}…)`]))

  return {
    total,
    page: query.page,
    limit: query.limit,
    items: items.map((item) => ({
      id: item.id,
      action: item.action,
      label: AUDIT_LABELS[item.action],
      result: item.result,
      actor: item.user?.name ?? (item.apiKeyId ? keyNames.get(item.apiKeyId) ?? 'Clé API' : 'Lien temporaire'),
      actorKind: item.user ? 'user' : item.apiKeyId ? 'apiKey' : 'public',
      fileId: item.fileId,
      target: item.target,
      ip: item.ip,
      userAgent: item.userAgent,
      details: item.details,
      createdAt: item.createdAt.toISOString(),
    })),
  }
}

export type LogItem = Awaited<ReturnType<typeof listLogs>>['items'][number]
