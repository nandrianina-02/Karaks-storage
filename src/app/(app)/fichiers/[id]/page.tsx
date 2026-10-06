import { Ban, CirclePlay, Download, Link2 } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ActivityList } from '@/components/dashboard/activity-list'
import { StatTile } from '@/components/dashboard/stat-tile'
import { FileDetail } from '@/components/files/file-detail'
import { Badge, Card, CardHeader } from '@/components/ui/surface'
import { fileDto, linkDto } from '@/lib/api/serialize'
import { providerInfo } from '@/lib/pages'
import { prisma } from '@/lib/prisma'
import { listLogs } from '@/lib/services/logs'
import { formatCount, formatRelative } from '@/lib/utils'
import { requireProject } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Fichier' }

const STATUS = {
  active: { label: 'Actif', tone: 'success' },
  expired: { label: 'Expiré', tone: 'neutral' },
  exhausted: { label: 'Épuisé', tone: 'warning' },
  revoked: { label: 'Révoqué', tone: 'danger' },
} as const

export default async function FilePage({ params }: { params: Promise<{ id: string }> }) {
  const workspace = await requireProject()
  const { project } = workspace
  const { id } = await params
  if (!workspace.can('files:read')) notFound()

  const file = await prisma.file.findFirst({
    where: { projectId: project.id, publicId: id, status: { in: ['ACTIVE', 'TRASHED'] } },
    include: { folder: { select: { publicId: true } } },
  })
  if (!file) notFound()

  const [links, activity] = await Promise.all([
    prisma.signedUrl.findMany({ where: { fileId: file.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
    workspace.can('logs:read') ? listLogs(project.id, { fileId: file.publicId, page: 1, limit: 12 }) : null,
  ])

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div>
        <FileDetail file={fileDto(file)} project={project.publicId} provider={providerInfo(project)} permissions={[...workspace.permissions]} />
      </div>
      <div className="space-y-5 xl:pt-10">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile icon={<CirclePlay />} label="Lectures" value={formatCount(file.streamCount)} />
          <StatTile icon={<Download />} label="Téléchargements" value={formatCount(file.downloadCount)} className="stagger-1" />
          <StatTile icon={<Link2 />} label="Liens créés" value={formatCount(links.length)} className="stagger-2" />
        </div>

        <Card className="animate-rise stagger-2">
          <CardHeader title="Liens temporaires de ce fichier" />
          {links.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-ink-2">Aucun lien créé pour ce fichier.</p>
          ) : (
            <ul>
              {links.map(linkDto).map((link) => (
                <li key={link.id} className="flex items-center gap-3 border-t border-line px-5 py-2.5 text-sm">
                  {link.status === 'revoked' ? <Ban className="h-4 w-4 text-danger" /> : <Link2 className="h-4 w-4 text-ink-2" />}
                  <span className="font-mono text-[0.78rem] text-ink-2">/s/{link.hint}…</span>
                  <span className="text-xs text-muted">{link.type === 'download' ? 'Téléchargement' : 'Lecture'}</span>
                  <span className="flex-1 text-right text-xs text-ink-2 tabular-nums">
                    {link.uses}
                    {link.maxUses !== null ? ` / ${link.maxUses}` : ''} utilisation{link.uses > 1 ? 's' : ''} · expire {formatRelative(link.expiresAt)}
                  </span>
                  <Badge tone={STATUS[link.status].tone}>{STATUS[link.status].label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {activity && (
          <Card className="animate-rise stagger-3">
            <CardHeader title="Historique du fichier" />
            <ActivityList items={activity.items} empty="Aucune opération enregistrée." />
          </Card>
        )}
      </div>
    </div>
  )
}
