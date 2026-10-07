import { z } from 'zod'

import { handle, identify, ok, readJson, resolveProject, type Params } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { migrationDto, startMigration } from '@/lib/services/storage-migration'

const input = z.object({ providerId: z.string().min(1) })

/**
 * POST /api/v1/projects/:id/migration — { providerId } : déplace les fichiers
 * du projet vers un autre stockage. Le projet reste en service pendant la
 * copie ; la suite avance par /api/v1/migrations/:id/step.
 */
export const POST = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const caller = await identify(request)
  if (caller.user?.role !== 'SUPER_ADMIN') throw new ApiError('forbidden', 'Réservé au super administrateur.')
  const { project } = await resolveProject(caller, (await params).id)
  const migration = await startMigration(project.id, input.parse(await readJson(request)).providerId, caller.actor)
  return ok({ migration: migrationDto(migration) }, { status: 201 })
})
