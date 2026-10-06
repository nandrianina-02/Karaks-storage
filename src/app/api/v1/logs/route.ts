import { authenticate, handle, ok } from '@/lib/api/context'
import { listLogs, logsQuery } from '@/lib/services/logs'

/** GET /api/v1/logs?action=UPLOAD&page=1 — journal d'audit du projet (CDS 23). */
export const GET = handle(async (request: Request) => {
  const ctx = await authenticate(request)
  ctx.require('logs:read')
  const query = logsQuery.parse(Object.fromEntries(new URL(request.url).searchParams))
  const result = await listLogs(ctx.project.id, query)
  return ok({
    logs: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total },
  })
})
