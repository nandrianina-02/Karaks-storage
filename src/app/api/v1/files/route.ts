import { authenticate, handle, ok } from '@/lib/api/context'
import { fileDto } from '@/lib/api/serialize'
import { listFiles, listQuery } from '@/lib/services/files'

/**
 * GET /api/v1/files?search=papaoutai&page=1&limit=50 (CDS 20)
 *
 * Filtres : search, folderId, folder=root, category, mimeType, status,
 * minSize, maxSize, from, to ; tri : sort, order.
 */
export const GET = handle(async (request: Request) => {
  const ctx = await authenticate(request)
  ctx.require('files:read')
  const query = listQuery.parse(Object.fromEntries(new URL(request.url).searchParams))
  const result = await listFiles(ctx.project.id, query)
  return ok({
    files: result.items.map(fileDto),
    pagination: { page: result.page, limit: result.limit, total: result.total, pages: result.pages },
  })
})
