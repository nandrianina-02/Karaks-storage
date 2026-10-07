import { z } from 'zod'

import { handle, identify, ok, readJson, resolveProject, type Params } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { projectDto } from '@/lib/api/serialize'
import { prisma } from '@/lib/prisma'
import { canDeleteProject, deleteProject, projectSettingsInput, updateProject } from '@/lib/services/projects'

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
  const updated = await updateProject(project.id, input, caller.actor, { canSetLimits: caller.user?.role === 'SUPER_ADMIN' })
  return ok({ project: projectDto(updated) })
})

/**
 * DELETE /api/v1/projects/:id — { "confirm": "<nom du projet>" }
 *
 * Irréversible : fichiers, dossiers, clés, liens, webhooks et statistiques
 * disparaissent, chez le fournisseur comme en base. Le nom à retaper évite
 * de supprimer un projet par erreur, en se trompant d'onglet ou de script.
 */
export const DELETE = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const { id } = await params
  const caller = await identify(request)
  if (!caller.user) throw new ApiError('forbidden', 'Une clé API ne peut pas supprimer un projet.')
  const { project } = await resolveProject(caller, id)
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: caller.user.id } },
  })
  if (!canDeleteProject(caller.user.role, membership?.role ?? null)) {
    throw new ApiError('forbidden', 'Seul le propriétaire du projet peut le supprimer.')
  }
  const { confirm } = z.object({ confirm: z.string() }).parse(await readJson(request))
  if (confirm.trim() !== project.name) {
    throw new ApiError('bad_request', 'Le nom saisi ne correspond pas à celui du projet.')
  }
  const result = await deleteProject(project.id, caller.actor)
  return ok({ deleted: { name: result.name, files: result.files } })
})
