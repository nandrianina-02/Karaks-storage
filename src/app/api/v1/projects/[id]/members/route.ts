import { handle, identify, ok, readJson, resolveProject, type Params } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { prisma } from '@/lib/prisma'
import { addOrInviteMember, listInvitations, memberInput } from '@/lib/services/members'

async function managed(request: Request, id: string) {
  const caller = await identify(request)
  const access = await resolveProject(caller, id)
  if (caller.apiKey || !caller.user || !access.permissions.includes('project:manage')) {
    throw new ApiError('forbidden', 'Permission manquante : project:manage.')
  }
  return { caller: { ...caller, user: caller.user }, project: access.project }
}

/** GET /api/v1/projects/:id/members — membres et invitations en attente. */
export const GET = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const { project } = await managed(request, (await params).id)
  const [members, invitations] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId: project.id },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    listInvitations(project.id),
  ])
  return ok({
    members: members.map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      since: member.createdAt.toISOString(),
    })),
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      invitedBy: invitation.invitedBy?.name ?? null,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    })),
  })
})

/**
 * POST /api/v1/projects/:id/members — { email, role }
 *
 * Compte existant : ajouté (ou rôle changé), réponse 201. Adresse inconnue :
 * invitation envoyée par courriel, réponse 202 avec le lien, que
 * l'administrateur peut transmettre lui-même si aucun serveur de courriel
 * n'est configuré.
 */
export const POST = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const { caller, project } = await managed(request, (await params).id)
  const result = await addOrInviteMember(project, memberInput.parse(await readJson(request)), caller.user, caller.actor)
  if (result.kind === 'member') {
    return ok({ member: { userId: result.member.userId, role: result.member.role } }, { status: 201 })
  }
  return ok(
    {
      invitation: {
        id: result.invitation.id,
        email: result.invitation.email,
        role: result.invitation.role,
        expiresAt: result.invitation.expiresAt.toISOString(),
        url: result.url,
        emailSent: result.sent,
      },
    },
    { status: 202 },
  )
})
