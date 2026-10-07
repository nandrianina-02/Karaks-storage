import { handle, identify, ok, type Params } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { cancelMigration, migrationDto } from '@/lib/services/storage-migration'

/**
 * POST /api/v1/migrations/:id/cancel — arrête la copie. Les fichiers déjà
 * déplacés restent servis depuis la destination ; les autres, depuis la
 * source. Une nouvelle migration peut ensuite tout ramener d'un côté.
 */
export const POST = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const caller = await identify(request)
  if (caller.user?.role !== 'SUPER_ADMIN') throw new ApiError('forbidden', 'Réservé au super administrateur.')
  const migration = await cancelMigration((await params).id)
  return ok({ migration: migrationDto(migration) })
})
