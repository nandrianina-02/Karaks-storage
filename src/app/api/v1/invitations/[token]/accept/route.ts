import { handle, identify, ok, type Params } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { acceptInvitation } from '@/lib/services/members'

/** POST /api/v1/invitations/:token/accept — par le compte invité, connecté. */
export const POST = handle(async (request: Request, { params }: Params<{ token: string }>) => {
  const { token } = await params
  const caller = await identify(request)
  if (!caller.user || caller.apiKey) throw new ApiError('unauthorized', 'Connectez-vous pour accepter l’invitation.')
  const { project } = await acceptInvitation(token, caller.user, caller.actor)
  return ok({ project: { id: project.publicId, name: project.name } })
})
