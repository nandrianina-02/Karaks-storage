import { handle, identify, ok, readJson, resolveProject, type Params } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { prisma } from '@/lib/prisma'
import { addMember, memberInput } from '@/lib/services/projects'

async function managed(request: Request, id: string) {
  const caller = await identify(request)
  const access = await resolveProject(caller, id)
  if (caller.apiKey || !access.permissions.includes('project:manage')) {
    throw new ApiError('forbidden', 'Permission manquante : project:manage.')
  }
  return access.project
}

/** GET /api/v1/projects/:id/members */
export const GET = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const project = await managed(request, (await params).id)
  const members = await prisma.projectMember.findMany({
    where: { projectId: project.id },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return ok({
    members: members.map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      since: member.createdAt.toISOString(),
    })),
  })
})

/** POST /api/v1/projects/:id/members — ajoute ou change le rôle d'un compte existant. */
export const POST = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const project = await managed(request, (await params).id)
  const member = await addMember(project.id, memberInput.parse(await readJson(request)))
  return ok({ member: { userId: member.userId, role: member.role } }, { status: 201 })
})
