import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { handle, identify } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { appUrl } from '@/lib/env'
import { randomBase62 } from '@/lib/security/crypto'
import { DRIVE_STATE_COOKIE, driveConnectUrl } from '@/lib/services/drive-connection'

/**
 * GET /api/v1/storage/google/connect — envoie le super administrateur sur
 * l'écran d'autorisation Google. Le paramètre `state`, gardé dans un cookie,
 * garantit au retour que l'autorisation a bien été demandée d'ici.
 */
export const GET = handle(async (request: Request) => {
  const caller = await identify(request)
  if (caller.user?.role !== 'SUPER_ADMIN') {
    throw new ApiError('forbidden', 'Seul le super administrateur peut relier le stockage.')
  }
  const state = randomBase62(32)
  const store = await cookies()
  store.set(DRIVE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: appUrl.startsWith('https://'),
    path: '/api/v1/storage/google',
    maxAge: 600,
  })
  return NextResponse.redirect(driveConnectUrl(state))
})
