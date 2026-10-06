import { CirclePlay, CloudUpload, Download, Network, SquareCode } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { StatTile } from '@/components/dashboard/stat-tile'
import { PeriodSelect, SeriesChart } from '@/components/dashboard/usage-card'
import { FileIcon } from '@/components/files/file-icon'
import { Card, CardHeader, PageHeader } from '@/components/ui/surface'
import { categoryOf, formatBytes } from '@/lib/files/types'
import { chartSeries, daysAgo, param, periodOf, type SearchParams } from '@/lib/pages'
import { prisma } from '@/lib/prisma'
import { monthlySeries, topFiles } from '@/lib/services/stats'
import { formatCount } from '@/lib/utils'
import { requireProject } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Analytics' }

const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })

/** Statistiques (CDS 22) : la période choisie en haut porte sur toute la page. */
export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const workspace = await requireProject()
  if (!workspace.can('stats:read')) redirect('/dashboard')
  const { project } = workspace
  const days = periodOf(param(await searchParams, 'periode'), 30)

  const [series, monthly, top, byProject] = await Promise.all([
    chartSeries(project.id, days),
    monthlySeries(project.id, 6),
    topFiles(project.id, 10),
    workspace.user.role === 'SUPER_ADMIN'
      ? prisma.project.findMany({
          select: {
            id: true,
            name: true,
            _count: { select: { files: { where: { status: 'ACTIVE' } } } },
            usage: { where: { day: { gte: daysAgo(days) } }, select: { requests: true, streams: true, bytesOut: true } },
          },
          orderBy: { createdAt: 'asc' },
        })
      : null,
  ])

  const sum = (points: { value: number }[]) => points.reduce((total, point) => total + point.value, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description={`Activité de ${project.name} sur les ${days} derniers jours.`} actions={<PeriodSelect value={days} />} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile icon={<Network />} label="Bande passante" value={formatBytes(sum(series.bytesOut))} />
        <StatTile icon={<SquareCode />} label="Requêtes API" value={formatCount(sum(series.requests))} className="stagger-1" />
        <StatTile icon={<CirclePlay />} label="Lectures" value={formatCount(sum(series.streams))} className="stagger-2" />
        <StatTile icon={<Download />} label="Téléchargements" value={formatCount(sum(series.downloads))} className="stagger-3" />
        <StatTile icon={<CloudUpload />} label="Téléversements" value={formatCount(sum(series.uploads))} className="stagger-4" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {[
          { title: 'Bande passante', points: series.bytesOut, format: 'bytes' as const },
          { title: 'Requêtes API', points: series.requests, format: 'count' as const },
          { title: 'Lectures', points: series.streams, format: 'count' as const },
          { title: 'Téléchargements', points: series.downloads, format: 'count' as const },
        ].map((chart, index) => (
          <Card key={chart.title} className={`animate-rise stagger-${index + 2}`}>
            <CardHeader title={chart.title} description="Par jour" />
            <div className="px-4 pb-4">
              <SeriesChart kind="columns" points={chart.points} format={chart.format} caption={`${chart.title} par jour`} />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="animate-rise stagger-3">
          <CardHeader title="Évolution mensuelle" />
          <div className="overflow-x-auto px-5 pb-4">
            <table className="w-full text-left text-[0.84rem]">
              <thead>
                <tr className="border-b border-line text-[0.78rem] text-ink-2">
                  <th className="py-2 font-medium">Mois</th>
                  <th className="py-2 text-right font-medium">Requêtes</th>
                  <th className="py-2 text-right font-medium">Lectures</th>
                  <th className="py-2 text-right font-medium">Téléch.</th>
                  <th className="py-2 text-right font-medium">Bande passante</th>
                </tr>
              </thead>
              <tbody>
                {monthly
                  .slice()
                  .reverse()
                  .map((row) => (
                    <tr key={row.month} className="border-b border-line last:border-b-0">
                      <td className="py-2.5 text-ink capitalize">{monthFormat.format(new Date(`${row.month}-15T12:00:00Z`))}</td>
                      <td className="py-2.5 text-right text-ink-2 tabular-nums">{formatCount(row.requests)}</td>
                      <td className="py-2.5 text-right text-ink-2 tabular-nums">{formatCount(row.streams)}</td>
                      <td className="py-2.5 text-right text-ink-2 tabular-nums">{formatCount(row.downloads)}</td>
                      <td className="py-2.5 text-right text-ink-2 tabular-nums">{formatBytes(row.bytesOut)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="animate-rise stagger-4">
          <CardHeader title="Fichiers les plus utilisés" />
          {top.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-ink-2">Aucune lecture ni téléchargement pour l’instant.</p>
          ) : (
            <ol className="px-3 pb-3">
              {top.map((file, index) => (
                <li key={file.id}>
                  <Link href={`/fichiers/${file.publicId}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                    <span className="w-5 text-right text-xs text-muted tabular-nums">{index + 1}</span>
                    <FileIcon category={categoryOf(file.mimeType)} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[0.84rem] text-ink">{file.originalName}</span>
                    <span className="text-xs whitespace-nowrap text-ink-2 tabular-nums">
                      {formatCount(file.streamCount)} lect. · {formatCount(file.downloadCount)} tél.
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {byProject && (
        <Card className="animate-rise stagger-5">
          <CardHeader title="Activité par projet" description={`Sur les ${days} derniers jours, tous projets confondus`} />
          <div className="overflow-x-auto px-5 pb-4">
            <table className="w-full min-w-[520px] text-left text-[0.84rem]">
              <thead>
                <tr className="border-b border-line text-[0.78rem] text-ink-2">
                  <th className="py-2 font-medium">Projet</th>
                  <th className="py-2 text-right font-medium">Fichiers</th>
                  <th className="py-2 text-right font-medium">Requêtes</th>
                  <th className="py-2 text-right font-medium">Lectures</th>
                  <th className="py-2 text-right font-medium">Bande passante</th>
                </tr>
              </thead>
              <tbody>
                {byProject.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-b-0">
                    <td className="py-2.5 text-ink">{row.name}</td>
                    <td className="py-2.5 text-right text-ink-2 tabular-nums">{formatCount(row._count.files)}</td>
                    <td className="py-2.5 text-right text-ink-2 tabular-nums">{formatCount(row.usage.reduce((t, u) => t + u.requests, 0))}</td>
                    <td className="py-2.5 text-right text-ink-2 tabular-nums">{formatCount(row.usage.reduce((t, u) => t + u.streams, 0))}</td>
                    <td className="py-2.5 text-right text-ink-2 tabular-nums">{formatBytes(row.usage.reduce((t, u) => t + Number(u.bytesOut), 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
