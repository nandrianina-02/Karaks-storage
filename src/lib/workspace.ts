import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'

import type { ProjectWithProvider } from '@/lib/api/context'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listProjectsFor } from '@/lib/services/projects'
import {
  canCreateProject,
  canManageUsers,
  permissionsFor,
  type GlobalRoleName,
  type Permission,
  type ProjectRoleName,
} from '@/lib/security/permissions'

/**
 * Espace de travail du tableau de bord : le compte connecté, ses projets, le
 * projet courant et les droits qu'il y a.
 *
 * Mis en cache pour la durée d'un rendu : la mise en page et la page en ont
 * besoin toutes deux, et ne doivent interroger la base qu'une fois.
 */
export const PROJECT_COOKIE = 'karaks-storage.project'

export interface Workspace {
  user: { id: string; name: string; email: string; image: string | null; role: GlobalRoleName }
  projects: { id: string; name: string; slug: string; role: string | null }[]
  project: ProjectWithProvider | null
  permissions: ReadonlySet<Permission>
  can(permission: Permission): boolean
  canCreateProject: boolean
  canManageUsers: boolean
}

export const getSessionUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  const user = session.user as typeof session.user & { role: GlobalRoleName; status: string }
  if (user.status !== 'ACTIVE') return null
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    role: user.role,
  }
})

export const getWorkspace = cache(async (): Promise<Workspace> => {
  const user = await getSessionUser()
  if (!user) redirect('/connexion')

  const projects = await listProjectsFor(user)
  const wanted = (await cookies()).get(PROJECT_COOKIE)?.value
  const current = projects.find((project) => project.publicId === wanted) ?? projects[0] ?? null

  const project = current
    ? await prisma.project.findUnique({ where: { id: current.id }, include: { provider: true } })
    : null
  const permissions = new Set<Permission>(
    current ? permissionsFor(user.role, (current.role as ProjectRoleName | null) ?? null) : [],
  )

  return {
    user,
    projects: projects.map((item) => ({ id: item.publicId, name: item.name, slug: item.slug, role: item.role })),
    project,
    permissions,
    can: (permission) => permissions.has(permission),
    canCreateProject: canCreateProject(user.role),
    canManageUsers: canManageUsers(user.role),
  }
})

/** Le projet courant, ou une redirection vers la page des projets s'il n'y en a aucun. */
export async function requireProject() {
  const workspace = await getWorkspace()
  if (!workspace.project) redirect('/projets')
  return workspace as Workspace & { project: ProjectWithProvider }
}
