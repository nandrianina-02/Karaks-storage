import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { FolderManager } from '@/components/files/folder-manager'
import { folderDto } from '@/lib/api/serialize'
import { param, type SearchParams } from '@/lib/pages'
import { prisma } from '@/lib/prisma'
import { folderPath, listFolders } from '@/lib/services/folders'
import { requireProject } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Dossiers' }

export default async function FoldersPage({ searchParams }: { searchParams: SearchParams }) {
  const workspace = await requireProject()
  if (!workspace.can('folders:read')) redirect('/dashboard')
  const { project } = workspace
  const requested = param(await searchParams, 'parent') ?? null
  const parent = requested ? await prisma.folder.findFirst({ where: { projectId: project.id, publicId: requested } }) : null
  const parentId = parent?.publicId ?? null

  const [folders, path] = await Promise.all([listFolders(project.id, parentId), folderPath(project.id, parentId)])

  return (
    <FolderManager
      project={project.publicId}
      parentId={parentId}
      path={path}
      folders={folders.map(folderDto)}
      canWrite={workspace.can('folders:write')}
    />
  )
}
