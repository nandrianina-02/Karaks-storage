import { handle, identify, ok, readJson, resolveProject, type Params } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { prisma } from '@/lib/prisma'
import { canTransferOwnership, transferInput, transferOwnership } from '@/lib/services/members'

/** POST /api/v1/projects/:id/transfer — { userId } : confie le projet à un autre membre. */
export const POST = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const { id } = await params
  const caller = await identify(request)
  if (!caller.user || caller.apiKey) throw new ApiError('forbidden', 'Une clé API ne peut pas transférer un projet.')
  const { project } = await resolveProject(caller, id)
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: caller.user.id } },
  })
  if (!canTransferOwnership(caller.user.role, membership?.role ?? null)) {
    throw new ApiError('forbidden', 'Seul le propriétaire du projet peut en transférer la propriété.')
  }
  const { userId } = transferInput.parse(await readJson(request))
  await transferOwnership(project.id, userId, caller.actor)
  return ok({})
})
