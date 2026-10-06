import { handle, identify, ok } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { isGoogleConfigured } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { providerQuota } from '@/lib/storage'

/**
 * GET /api/v1/storage — état des fournisseurs de stockage, pour le super
 * administrateur. Les identifiants des dossiers Drive n'y figurent pas.
 */
export const GET = handle(async (request: Request) => {
  const caller = await identify(request)
  if (caller.user?.role !== 'SUPER_ADMIN') throw new ApiError('forbidden', 'Réservé au super administrateur.')
  const providers = await prisma.storageProvider.findMany({
    include: { _count: { select: { projects: true, files: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const items = await Promise.all(
    providers.map(async (provider) => {
      const quota = provider.status === 'CONNECTED' ? await providerQuota(provider).catch(() => null) : null
      return {
        id: provider.id,
        kind: provider.kind,
        name: provider.name,
        status: provider.status,
        account: provider.accountEmail,
        lastError: provider.lastError,
        connectedAt: provider.connectedAt?.toISOString() ?? null,
        projects: provider._count.projects,
        files: provider._count.files,
        quota: quota ? { usage: quota.usage, limit: quota.limit } : null,
      }
    }),
  )
  return ok({ googleConfigured: isGoogleConfigured, providers: items })
})
