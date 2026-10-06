import type { Metadata } from 'next'

import { ProjectsManager } from '@/components/projects/projects-manager'
import { projectDto } from '@/lib/api/serialize'
import { param, type SearchParams } from '@/lib/pages'
import { prisma } from '@/lib/prisma'
import { listProjectsFor } from '@/lib/services/projects'
import { getWorkspace } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Projets' }

export default async function ProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  const workspace = await getWorkspace()
  const projects = await listProjectsFor(workspace.user)
  const ids = projects.map((project) => project.id)

  const [sizes, counts] = await Promise.all([
    prisma.file.groupBy({
      by: ['projectId'],
      where: { projectId: { in: ids }, status: { in: ['ACTIVE', 'TRASHED'] } },
      _sum: { size: true },
      _count: { _all: true },
    }),
    prisma.project.findMany({
      where: { id: { in: ids } },
      select: { id: true, _count: { select: { apiKeys: { where: { revokedAt: null } }, members: true } } },
    }),
  ])

  return (
    <ProjectsManager
      current={workspace.project?.publicId ?? null}
      canCreate={workspace.canCreateProject}
      superAdmin={workspace.user.role === 'SUPER_ADMIN'}
      openCreate={param(await searchParams, 'nouveau') === '1'}
      projects={projects.map((project) => {
        const size = sizes.find((row) => row.projectId === project.id)
        const count = counts.find((row) => row.id === project.id)
        return {
          ...projectDto(project),
          files: size?._count._all ?? 0,
          bytes: Number(size?._sum.size ?? 0),
          keys: count?._count.apiKeys ?? 0,
          members: count?._count.members ?? 0,
        }
      })}
    />
  )
}
