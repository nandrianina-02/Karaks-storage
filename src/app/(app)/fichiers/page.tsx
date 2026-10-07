import type { Metadata } from 'next'

import { OverviewTiles } from '@/components/dashboard/overview-tiles'
import { RecentFiles } from '@/components/dashboard/recent-files'
import { PeriodSelect, SeriesChart } from '@/components/dashboard/usage-card'
import { FilesExplorer, type ExplorerQuery } from '@/components/files/files-explorer'
import { Card, CardHeader } from '@/components/ui/surface'
import { fileDto, folderDto } from '@/lib/api/serialize'
import { activeFilterCount, filterCriteria, parseFilters } from '@/lib/files/filters'
import { chartSeries, param, periodOf, providerInfo, type SearchParams } from '@/lib/pages'
import { prisma } from '@/lib/prisma'
import { listFiles } from '@/lib/services/files'
import { folderPath, listFolders } from '@/lib/services/folders'
import { projectOverview } from '@/lib/services/stats'
import { requireProject } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Fichiers' }

const SORTS = ['updatedAt', 'createdAt', 'name', 'size', 'type'] as const
const LIMIT = 50

export default async function FilesPage({ searchParams }: { searchParams: SearchParams }) {
  const workspace = await requireProject()
  const { project } = workspace
  const params = await searchParams

  const sortParam = param(params, 'tri')
  const query: ExplorerQuery = {
    search: param(params, 'q')?.slice(0, 120) ?? '',
    sort: SORTS.includes(sortParam as (typeof SORTS)[number]) ? (sortParam as ExplorerQuery['sort']) : 'updatedAt',
    view: param(params, 'vue') === 'grille' ? 'grid' : 'list',
    trash: param(params, 'corbeille') === '1',
    page: Math.max(1, Number(param(params, 'page')) || 1),
    order: param(params, 'sens') === 'asc' ? 'asc' : param(params, 'sens') === 'desc' ? 'desc' : null,
    filters: parseFilters((name) => param(params, name)),
  }
  // Une recherche ou un filtre parcourt tout le projet, sauf si l'on a
  // demandé de rester dans le dossier ouvert.
  const filtering = Boolean(query.search) || activeFilterCount(query.filters) > 0
  const days = periodOf(param(params, 'periode'))

  // Un dossier inconnu (lien périmé) ramène à la racine plutôt qu'à une erreur.
  const requestedFolder = param(params, 'dossier') ?? null
  const folder = requestedFolder
    ? await prisma.folder.findFirst({ where: { projectId: project.id, publicId: requestedFolder } })
    : null
  const folderId = query.trash || (filtering && !query.filters.inFolder) ? null : folder?.publicId ?? null

  const [folders, path, result, overview, series, recent, selectedRow] = await Promise.all([
    listFolders(project.id, folderId),
    folderPath(project.id, folderId),
    listFiles(project.id, {
      search: query.search || undefined,
      folderId: folderId ?? undefined,
      folder: !filtering && !query.trash && !folderId ? 'root' : undefined,
      status: query.trash ? 'trashed' : 'active',
      ...filterCriteria(query.filters),
      sort: query.sort,
      order: query.order ?? undefined,
      page: query.page,
      limit: LIMIT,
    }),
    projectOverview(project),
    chartSeries(project.id, days),
    prisma.file.findMany({
      where: { projectId: project.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take: 4,
      include: { folder: { select: { publicId: true } } },
    }),
    param(params, 'fichier')
      ? prisma.file.findFirst({
          where: { projectId: project.id, publicId: param(params, 'fichier'), status: { in: ['ACTIVE', 'TRASHED'] } },
          include: { folder: { select: { publicId: true } } },
        })
      : null,
  ])

  return (
    <FilesExplorer
      project={project.publicId}
      provider={providerInfo(project)}
      permissions={[...workspace.permissions]}
      folderId={folderId}
      path={path}
      folders={folders.map(folderDto)}
      files={result.items.map(fileDto)}
      total={result.total}
      limit={LIMIT}
      query={query}
      initialSelected={selectedRow ? fileDto(selectedRow) : null}
      trashRetentionDays={project.trashRetentionDays}
      filterFolder={folder && !query.trash ? { id: folder.publicId, name: folder.name } : null}
      stats={<OverviewTiles overview={overview} />}
      bottom={
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card className="animate-rise stagger-3">
            <CardHeader title="Utilisation du stockage" actions={<PeriodSelect value={days} />} />
            <div className="px-4 pb-4">
              <SeriesChart kind="area" points={series.stored} format="bytes" caption="Volume stocké en fin de journée" />
            </div>
          </Card>
          <RecentFiles files={recent.map(fileDto)} className="animate-rise stagger-4" />
        </div>
      }
    />
  )
}
