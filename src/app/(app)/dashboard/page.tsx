import { CirclePlay, CloudUpload, Download, FolderPlus, KeyRound, Layers, Link2, Plus, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { ActivityList } from '@/components/dashboard/activity-list'
import { OverviewTiles } from '@/components/dashboard/overview-tiles'
import { StatTile } from '@/components/dashboard/stat-tile'
import { PeriodSelect, SeriesChart } from '@/components/dashboard/usage-card'
import { FileIcon } from '@/components/files/file-icon'
import { ProviderMark } from '@/components/files/file-panel'
import { LinkButton } from '@/components/ui/button'
import { Badge, Card, CardHeader, EmptyState, Meter, meterTone, PageHeader } from '@/components/ui/surface'
import { categoryOf, formatBytes } from '@/lib/files/types'
import { chartSeries, param, periodOf, type SearchParams } from '@/lib/pages'
import { listLogs } from '@/lib/services/logs'
import { projectOverview, topFiles } from '@/lib/services/stats'
import { prisma } from '@/lib/prisma'
import { formatCount, formatDate } from '@/lib/utils'
import { getWorkspace } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Dashboard' }

/** Vue globale (CDS 6.1) : stockage, fichiers, trafic, activité, état du stockage. */
export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const workspace = await getWorkspace()
  const { project } = workspace

  if (!project) {
    return (
      <div className="space-y-6">
        <PageHeader title={`Bonjour, ${workspace.user.name.split(' ')[0]}`} description="Bienvenue sur Karaks Storage." />
        <Card className="animate-rise stagger-1">
          <EmptyState
            icon={<Layers />}
            title={workspace.canCreateProject ? 'Créez votre premier projet' : 'Aucun projet pour l’instant'}
            description={
              workspace.canCreateProject
                ? 'Un projet regroupe les fichiers, les clés API et les statistiques d’une application, par exemple Karaks Production.'
                : 'Un administrateur doit vous ajouter à un projet pour que vous puissiez y accéder.'
            }
            action={
              workspace.canCreateProject ? (
                <LinkButton href="/projets?nouveau=1" variant="primary" icon={<Plus className="h-4 w-4" />}>
                  Créer un projet
                </LinkButton>
              ) : undefined
            }
          />
        </Card>
      </div>
    )
  }

  const params = await searchParams
  const days = periodOf(param(params, 'periode'), 30)
  const canStats = workspace.can('stats:read')
  const [overview, series, activity, top] = await Promise.all([
    projectOverview(project),
    chartSeries(project.id, days),
    workspace.can('logs:read') ? listLogs(project.id, { page: 1, limit: 8 }) : null,
    topFiles(project.id, 5),
  ])
  const provider = overview.provider
  const admin = workspace.user.role === 'SUPER_ADMIN' || workspace.user.role === 'ADMIN'
  const secured = admin
    ? (await prisma.user.findUnique({ where: { id: workspace.user.id }, select: { twoFactorEnabled: true } }))?.twoFactorEnabled
    : true
  const providerPercent = provider.limit ? ((provider.usage ?? 0) / provider.limit) * 100 : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Vue d’ensemble de ${project.name}.`}
        actions={
          <>
            {canStats && <PeriodSelect value={days} />}
            {workspace.can('files:upload') && (
              <LinkButton href="/televersement" variant="primary" icon={<CloudUpload className="h-[18px] w-[18px]" />}>
                Téléverser
              </LinkButton>
            )}
          </>
        }
      />

      {!secured && (
        <Link
          href="/profil"
          className="animate-rise flex items-center gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-ink transition-colors hover:border-warning"
        >
          <ShieldCheck className="h-5 w-5 shrink-0 text-warning" />
          <span className="flex-1">
            <strong className="font-medium">Protégez votre compte administrateur.</strong> Activez la double authentification : un mot de passe volé ne
            suffira plus à ouvrir le service.
          </span>
          <span className="text-xs text-ink-2">Profil</span>
        </Link>
      )}

      <OverviewTiles overview={overview} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile icon={<CirclePlay />} label="Lectures ce mois" value={formatCount(overview.month.streams)} change={overview.month.change.streams} className="stagger-4" />
        <StatTile icon={<Download />} label="Téléchargements ce mois" value={formatCount(overview.month.downloads)} change={overview.month.change.downloads} className="stagger-5" />
        <StatTile icon={<CloudUpload />} label="Fichiers ajoutés ce mois" value={formatCount(overview.month.filesAdded)} className="stagger-6" />
      </div>

      {canStats && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="animate-rise stagger-2">
            <CardHeader title="Utilisation du stockage" description="Volume stocké en fin de journée" />
            <div className="px-4 pb-4">
              <SeriesChart kind="area" points={series.stored} format="bytes" caption="Volume stocké en fin de journée" />
            </div>
          </Card>
          <Card className="animate-rise stagger-3">
            <CardHeader title="Bande passante" description="Octets servis par jour : lectures, téléchargements et liens" />
            <div className="px-4 pb-4">
              <SeriesChart kind="columns" points={series.bytesOut} format="bytes" caption="Bande passante quotidienne" />
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="animate-rise stagger-3">
          <CardHeader
            title="Activité récente"
            actions={
              workspace.can('logs:read') ? (
                <Link href="/journal" className="text-[0.8rem] text-accent hover:underline">
                  Tout le journal
                </Link>
              ) : undefined
            }
          />
          {activity ? (
            <ActivityList items={activity.items} />
          ) : (
            <p className="px-5 pb-6 text-sm text-ink-2">Le journal est réservé aux rôles qui y ont accès.</p>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="animate-rise stagger-4">
            <CardHeader title="État du stockage" />
            <div className="space-y-4 px-5 pb-5">
              <div className="flex items-center gap-3">
                <ProviderMark kind={provider.kind} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {provider.kind === 'GOOGLE_DRIVE' ? 'Google Drive' : 'Disque local (développement)'}
                  </p>
                  <p className="truncate text-xs text-muted">{provider.account ?? 'Compte non renseigné'}</p>
                </div>
                {provider.status === 'CONNECTED' ? (
                  <Badge tone="success">Connecté</Badge>
                ) : (
                  <Badge tone="danger" icon={<TriangleAlert />}>
                    À reconnecter
                  </Badge>
                )}
              </div>
              {providerPercent !== null && provider.limit && (
                <div>
                  <Meter value={providerPercent} tone={meterTone(providerPercent)} label="Espace du compte de stockage" />
                  <p className="mt-2 flex justify-between text-xs text-ink-2 tabular-nums">
                    <span>
                      {formatBytes(provider.usage ?? 0)} utilisés sur {formatBytes(provider.limit)}
                    </span>
                    <span>{Math.round(providerPercent)} %</span>
                  </p>
                </div>
              )}
              <p className="text-xs leading-relaxed text-muted">
                Les fichiers sont privés chez le fournisseur : ils ne sont servis que par l’API et par des liens temporaires.
              </p>
            </div>
          </Card>

          <Card className="animate-rise stagger-5">
            <CardHeader title="Fichiers les plus utilisés" />
            {top.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-ink-2">Les fichiers les plus lus et téléchargés apparaîtront ici.</p>
            ) : (
              <ul className="px-3 pb-3">
                {top.map((file) => (
                  <li key={file.id}>
                    <Link href={`/fichiers/${file.publicId}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                      <FileIcon category={categoryOf(file.mimeType)} />
                      <span className="min-w-0 flex-1 truncate text-[0.84rem] text-ink">{file.originalName}</span>
                      <span className="text-xs whitespace-nowrap text-ink-2 tabular-nums">
                        {formatCount(file.streamCount)} lect. · {formatCount(file.downloadCount)} tél.
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="animate-rise stagger-6">
            <CardHeader title="Raccourcis" />
            <div className="grid grid-cols-2 gap-2 px-5 pb-5">
              {[
                { href: '/televersement', label: 'Téléverser', icon: CloudUpload, show: workspace.can('files:upload') },
                { href: '/dossiers', label: 'Nouveau dossier', icon: FolderPlus, show: workspace.can('folders:write') },
                { href: '/liens', label: 'Liens temporaires', icon: Link2, show: workspace.can('files:read') },
                { href: '/cles-api', label: 'Clés API', icon: KeyRound, show: workspace.can('api-keys:manage') },
              ]
                .filter((item) => item.show)
                .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-[0.84rem] text-ink transition-colors hover:border-line-strong hover:bg-surface-2"
                  >
                    <item.icon className="h-4 w-4 text-ink-2" />
                    {item.label}
                  </Link>
                ))}
            </div>
            <p className="border-t border-line px-5 py-3 text-xs text-muted">Projet créé le {formatDate(project.createdAt)}</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
