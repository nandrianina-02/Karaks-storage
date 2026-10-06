import { handle, identify, ok, readJson } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { projectDto } from '@/lib/api/serialize'
import { prisma } from '@/lib/prisma'
import { createProject, listProjectsFor, projectInput } from '@/lib/services/projects'

/** GET /api/v1/projects — projets accessibles à l'appelant. */
export const GET = handle(async (request: Request) => {
  const caller = await identify(request)
  if (caller.apiKey) {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: caller.apiKey.projectId } })
    return ok({ projects: [projectDto(project)] })
  }
  const projects = await listProjectsFor(caller.user!)
  return ok({ projects: projects.map(projectDto) })
})

/** POST /api/v1/projects — création, réservée aux administrateurs (CDS 39). */
export const POST = handle(async (request: Request) => {
  const caller = await identify(request)
  if (!caller.user) throw new ApiError('forbidden', 'Une clé API ne peut pas créer de projet.')
  const input = projectInput.parse(await readJson(request))
  const project = await createProject(input, caller.user, caller.actor)
  return ok({ project: projectDto({ ...project, role: 'OWNER' }) }, { status: 201 })
})
