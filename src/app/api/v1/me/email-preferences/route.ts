import { z } from 'zod'

import { handle, identify, ok, readJson } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { prisma } from '@/lib/prisma'
import { OPTIONAL_CATEGORIES, setOptOut } from '@/lib/services/email-notifications'

const input = z.object({ optOut: z.array(z.enum(OPTIONAL_CATEGORIES as [string, ...string[]])).max(10) })

async function account(request: Request) {
  const caller = await identify(request)
  if (!caller.user || caller.apiKey) throw new ApiError('forbidden', 'Réservé aux comptes du tableau de bord.')
  return caller.user
}

/** GET /api/v1/me/email-preferences — catégories d'emails refusées. */
export const GET = handle(async (request: Request) => {
  const user = await account(request)
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { emailOptOut: true } })
  return ok({ optOut: row.emailOptOut })
})

/** PATCH /api/v1/me/email-preferences — { optOut: ["projects", "operations"] }. La sécurité ne se refuse pas. */
export const PATCH = handle(async (request: Request) => {
  const user = await account(request)
  const { optOut } = input.parse(await readJson(request))
  const row = await setOptOut(user.id, optOut as typeof OPTIONAL_CATEGORIES)
  return ok({ optOut: row.emailOptOut })
})
