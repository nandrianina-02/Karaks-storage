import { Database, FileText, Network, SquareCode } from 'lucide-react'

import { StatTile } from '@/components/dashboard/stat-tile'
import type { projectOverview } from '@/lib/services/stats'
import { formatBytes } from '@/lib/files/types'
import { formatCount } from '@/lib/utils'

type Overview = Awaited<ReturnType<typeof projectOverview>>

/** Les quatre tuiles de la maquette : stockage, fichiers, bande passante, requêtes. */
export function OverviewTiles({ overview }: { overview: Overview }) {
  const { storage, month } = overview
  const percent = storage.limit ? (storage.used / storage.limit) * 100 : null
  const [value, unit] = formatBytes(storage.used).split(' ')
  const [bandwidth, bandwidthUnit] = formatBytes(month.bytesOut).split(' ')

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 2xl:grid-cols-[1.25fr_1fr_1fr_1fr]">
      <StatTile
        icon={<Database />}
        label="Stockage"
        value={value}
        unit={`${unit}${storage.limit ? ` / ${formatBytes(storage.limit)}` : ''}`}
        meter={percent !== null ? { percent, label: 'Part du stockage utilisée' } : undefined}
      />
      <StatTile
        icon={<FileText />}
        label="Fichiers"
        value={formatCount(storage.files)}
        change={month.change.files}
        className="stagger-1"
      />
      <StatTile
        icon={<Network />}
        label="Bande passante"
        value={bandwidth}
        unit={bandwidthUnit}
        change={month.change.bytesOut}
        className="stagger-2"
      />
      <StatTile
        icon={<SquareCode />}
        label="Requêtes API"
        value={formatCount(month.requests)}
        change={month.change.requests}
        className="stagger-3"
      />
    </div>
  )
}
