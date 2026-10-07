import { handle, identify, ok, resolveProject, type Params } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { revokeInvitation } from '@/lib/services/members'

/** DELETE /api/v1/projects/:id/invitations/:invitationId — le lien cesse aussitôt de fonctionner. */
export const DELETE = handle(async (request: Request, { params }: Params<{ id: string; invitationId: string }>) => {
  const { id, invitationId } = await params
  const caller = await identify(request)
  const { project, permissions } = await resolveProject(caller, id)
  if (caller.apiKey || !permissions.includes('project:manage')) {
    throw new ApiError('forbidden', 'Permission manquante : project:manage.')
  }
  await revokeInvitation(project.id, invitationId, caller.actor)
  return ok({})
})
