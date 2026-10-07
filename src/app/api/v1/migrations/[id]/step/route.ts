import { handle, identify, ok, type Params } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { migrationDto, stepMigration } from '@/lib/services/storage-migration'

/** Une tranche de copie tient dans la minute d'une fonction Vercel. */
export const maxDuration = 60

/** POST /api/v1/migrations/:id/step — fait avancer la copie une quarantaine de secondes. */
export const POST = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const caller = await identify(request)
  if (caller.user?.role !== 'SUPER_ADMIN') throw new ApiError('forbidden', 'Réservé au super administrateur.')
  const migration = await stepMigration((await params).id)
  return ok({ migration: migrationDto(migration) })
})
