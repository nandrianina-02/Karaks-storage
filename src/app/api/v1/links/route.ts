import { authenticate, handle, ok } from '@/lib/api/context'
import { linkDto } from '@/lib/api/serialize'
import { listLinks, listLinksQuery } from '@/lib/services/links'

/** GET /api/v1/links?status=active — liens temporaires du projet. */
export const GET = handle(async (request: Request) => {
  const ctx = await authenticate(request)
  ctx.require('files:read')
  const query = listLinksQuery.parse(Object.fromEntries(new URL(request.url).searchParams))
  const result = await listLinks(ctx.project.id, query)
  return ok({
    links: result.items.map(linkDto),
    pagination: { page: result.page, limit: result.limit, total: result.total },
  })
})
