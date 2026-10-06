import { z } from 'zod'

import { handle, identify, ok, readJson, type Params } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { prisma } from '@/lib/prisma'
import { canManageUsers } from '@/lib/security/permissions'

const input = z.object({
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'DEVELOPER', 'USER', 'SERVICE']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
})

/** PATCH /api/v1/users/:id — rôle et suspension. */
export const PATCH = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const caller = await identify(request)
  const user = caller.user
  if (!user || !canManageUsers(user.role)) throw new ApiError('forbidden', 'Réservé aux administrateurs.')
  const { id } = await params
  const change = input.parse(await readJson(request))

  if (id === user.id) throw new ApiError('conflict', 'Vous ne pouvez pas modifier votre propre compte ici.')
  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) throw new ApiError('not_found', 'Compte introuvable.')
  // Seul un super administrateur fait ou défait un super administrateur :
  // sinon un administrateur pourrait s'élever au-dessus de son rôle.
  if ((change.role === 'SUPER_ADMIN' || target.role === 'SUPER_ADMIN') && user.role !== 'SUPER_ADMIN') {
    throw new ApiError('forbidden', 'Réservé au super administrateur.')
  }

  const updated = await prisma.user.update({ where: { id }, data: change })
  // Une suspension prend effet tout de suite : les sessions ouvertes tombent.
  if (change.status === 'SUSPENDED') await prisma.session.deleteMany({ where: { userId: id } })
  return ok({ user: { id: updated.id, role: updated.role, status: updated.status } })
})
