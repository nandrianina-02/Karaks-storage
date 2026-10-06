import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { identify } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { appUrl } from '@/lib/env'
import { safeEqual } from '@/lib/security/crypto'
import { completeDriveConnection, DRIVE_STATE_COOKIE } from '@/lib/services/drive-connection'

function back(status: 'connecte' | 'erreur', message?: string) {
  const target = new URL('/parametres', appUrl)
  target.searchParams.set('onglet', 'stockage')
  target.searchParams.set('drive', status)
  if (message) target.searchParams.set('message', message)
  return NextResponse.redirect(target)
}

/** GET /api/v1/storage/google/callback — retour de l'écran d'autorisation Google. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const store = await cookies()
  const expected = store.get(DRIVE_STATE_COOKIE)?.value
  store.delete({ name: DRIVE_STATE_COOKIE, path: '/api/v1/storage/google' })

  if (url.searchParams.get('error')) return back('erreur', 'L’autorisation a été refusée sur l’écran de Google.')
  const state = url.searchParams.get('state') ?? ''
  const code = url.searchParams.get('code')
  if (!expected || !code || !safeEqual(state, expected)) {
    return back('erreur', 'Autorisation expirée ou invalide : recommencez depuis les réglages.')
  }

  try {
    const caller = await identify(request)
    if (caller.user?.role !== 'SUPER_ADMIN') throw new ApiError('forbidden', 'Action réservée au super administrateur.')
    await completeDriveConnection(code, caller.actor)
    return back('connecte')
  } catch (error) {
    console.error('[drive]', error instanceof Error ? error.message : error)
    return back('erreur', error instanceof ApiError ? error.message : 'Google Drive n’a pas pu être relié.')
  }
}
