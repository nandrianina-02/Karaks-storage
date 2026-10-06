import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ActivityList } from '@/components/dashboard/activity-list'
import { MediaLibrary } from '@/components/files/media-library'
import { Card, CardHeader, PageHeader } from '@/components/ui/surface'
import { fileDto } from '@/lib/api/serialize'
import { prisma } from '@/lib/prisma'
import { listLogs } from '@/lib/services/logs'
import { requireProject } from '@/lib/workspace'

export const metadata: Metadata = { title: 'En lecture' }

export default async function PlaybackPage() {
  const workspace = await requireProject()
  if (!workspace.can('stream:read')) redirect('/dashboard')
  const { project } = workspace

  const [files, streams] = await Promise.all([
    prisma.file.findMany({
      where: {
        projectId: project.id,
        status: 'ACTIVE',
        OR: [{ mimeType: { startsWith: 'audio/' } }, { mimeType: { startsWith: 'video/' } }],
      },
      orderBy: [{ streamCount: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: { folder: { select: { publicId: true } } },
    }),
    workspace.can('logs:read') ? listLogs(project.id, { action: 'STREAM', page: 1, limit: 10 }) : null,
  ])

  return (
    <div className="space-y-6">
      <PageHeader title="En lecture" description="Écoutez les médias du projet et suivez les lectures en cours chez vos clients." />
      <MediaLibrary
        project={project.publicId}
        files={files.map(fileDto)}
        canLink={workspace.can('links:create')}
        canDownload={workspace.can('download:read')}
      />
      {streams && (
        <Card className="animate-rise stagger-3">
          <CardHeader title="Dernières lectures" description="Chaque lecture est comptée à son ouverture, pas à chaque morceau demandé par le lecteur." />
          <ActivityList items={streams.items} empty="Aucune lecture enregistrée pour l’instant." />
        </Card>
      )}
    </div>
  )
}
