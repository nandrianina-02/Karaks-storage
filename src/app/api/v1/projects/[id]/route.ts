import { handle, identify, ok, readJson, resolveProject, type Params } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { projectDto } from '@/lib/api/serialize'
import { projectSettingsInput, updateProject } from '@/lib/services/projects'

/** GET /api/v1/projects/:id */
export const GET = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const { id } = await params
  const caller = await identify(request)
  const { project } = await resolveProject(caller, id)
  return ok({ project: projectDto(project) })
})

/** PATCH /api/v1/projects/:id — réglages, CORS, limites (CDS 25, 26). */
export const PATCH = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const { id } = await params
  const caller = await identify(request)
  const { project, permissions } = await resolveProject(caller, id)
  if (caller.apiKey || !permissions.includes('project:manage')) {
    throw new ApiError('forbidden', 'Permission manquante : project:manage.')
  }
  const input = projectSettingsInput.parse(await readJson(request))
  const updated = await updateProject(project.id, input, caller.actor)
  return ok({ project: projectDto(updated) })
})
