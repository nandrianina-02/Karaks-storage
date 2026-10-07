import type { AuditAction } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { AUDIT_LABELS } from '@/lib/services/audit'

/**
 * Notifications du tableau de bord : les événements marquants des projets de
 * l'utilisateur, tirés du journal. Pas de table à part — le journal porte
 * déjà tout, et une seule date (« vu jusqu'ici ») suffit à marquer la lecture.
 *
 * Les lectures et téléchargements en sont exclus : un catalogue écouté en
 * produit des milliers, ils noieraient le reste.
 */
const NOTABLE: AuditAction[] = [
  'UPLOAD',
  'DELETE',
  'DELETE_PERMANENT',
  'RESTORE',
  'CREATE_API_KEY',
  'REVOKE_API_KEY',
  'CREATE_PROJECT',
  'DELETE_PROJECT',
  'CONNECT_PROVIDER',
  'CREATE_WEBHOOK',
  'LOGIN_FAILED',
  'ADD_MEMBER',
  'TRANSFER_OWNERSHIP',
]

export async function notificationsFor(userId: string, take = 12) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { notificationsSeenAt: true, role: true, memberships: { select: { projectId: true } } },
  })
  const projectIds = user.memberships.map((membership) => membership.projectId)
  const items = await prisma.auditLog.findMany({
    where: {
      action: { in: NOTABLE },
      OR: [
        { projectId: { in: projectIds } },
        // Les événements de plateforme, hors de tout projet, ne concernent
        // que celui qui l'administre.
        ...(user.role === 'SUPER_ADMIN'
          ? [{ projectId: null, action: { in: ['CONNECT_PROVIDER', 'LOGIN_FAILED', 'DELETE_PROJECT'] as AuditAction[] } }]
          : []),
      ],
    },
    include: { user: { select: { name: true } }, project: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take,
  })
  const seen = user.notificationsSeenAt?.getTime() ?? 0
  return {
    unread: items.filter((item) => item.createdAt.getTime() > seen).length,
    items: items.map((item) => ({
      id: item.id,
      action: item.action,
      label: AUDIT_LABELS[item.action],
      target: item.target,
      project: item.project?.name ?? null,
      actor: item.user?.name ?? (item.apiKeyId ? 'Clé API' : null),
      unread: item.createdAt.getTime() > seen,
      createdAt: item.createdAt.toISOString(),
    })),
  }
}

export async function markNotificationsSeen(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { notificationsSeenAt: new Date() } })
}
