import { z } from 'zod'

import { authenticate, handle, ok } from '@/lib/api/context'
import { fileDto } from '@/lib/api/serialize'
import { dailySeries, monthlySeries, projectOverview, topFiles } from '@/lib/services/stats'

const query = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) })

/** GET /api/v1/stats?days=30 — vue d'ensemble, séries et fichiers les plus utilisés (CDS 22). */
export const GET = handle(async (request: Request) => {
  const ctx = await authenticate(request)
  ctx.require('stats:read')
  const { days } = query.parse(Object.fromEntries(new URL(request.url).searchParams))
  const [overview, daily, monthly, top] = await Promise.all([
    projectOverview(ctx.project),
    dailySeries(ctx.project.id, days),
    monthlySeries(ctx.project.id, 6),
    topFiles(ctx.project.id),
  ])
  return ok({ overview, daily, monthly, topFiles: top.map(fileDto) })
})
