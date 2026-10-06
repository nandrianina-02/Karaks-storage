import { handle, identify, ok } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { prisma } from '@/lib/prisma'
import { canManageUsers } from '@/lib/security/permissions'

/** GET /api/v1/users — comptes de la plateforme, pour les administrateurs (CDS 17). */
export const GET = handle(async (request: Request) => {
  const caller = await identify(request)
  if (!caller.user || !canManageUsers(caller.user.role)) {
    throw new ApiError('forbidden', 'Réservé aux administrateurs.')
  }
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { memberships: true } } },
  })
  return ok({
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      projects: user._count.memberships,
      createdAt: user.createdAt.toISOString(),
    })),
  })
})
