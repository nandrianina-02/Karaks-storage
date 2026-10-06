import { handle, identify, ok, resolveProject, type Params } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { removeMember } from '@/lib/services/projects'

/** DELETE /api/v1/projects/:id/members/:userId */
export const DELETE = handle(async (request: Request, { params }: Params<{ id: string; userId: string }>) => {
  const { id, userId } = await params
  const caller = await identify(request)
  const { project, permissions } = await resolveProject(caller, id)
  if (caller.apiKey || !permissions.includes('project:manage')) {
    throw new ApiError('forbidden', 'Permission manquante : project:manage.')
  }
  await removeMember(project.id, userId)
  return ok({})
})
