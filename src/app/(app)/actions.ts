'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { getWorkspace, PROJECT_COOKIE } from '@/lib/workspace'

/**
 * Change de projet courant. Le choix est gardé dans un cookie : il suit le
 * compte d'une page à l'autre sans paramètre dans chaque adresse.
 */
export async function selectProject(publicId: string) {
  const workspace = await getWorkspace()
  if (!workspace.projects.some((project) => project.id === publicId)) return { ok: false }
  ;(await cookies()).set(PROJECT_COOKIE, publicId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath('/', 'layout')
  return { ok: true }
}
