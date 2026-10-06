import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { Meter, meterTone } from '@/components/ui/surface'
import { cn } from '@/lib/utils'

/**
 * Tuile de statistique (maquette : Stockage, Fichiers, Bande passante,
 * Requêtes API). La variation compare à la même période du mois précédent ;
 * elle est toujours accompagnée d'une flèche, jamais de la seule couleur.
 */
export function StatTile({
  icon,
  label,
  value,
  unit,
  change,
  meter,
  className,
}: {
  icon: ReactNode
  label: string
  value: string
  unit?: string
  change?: number | null
  meter?: { percent: number; label: string }
  className?: string
}) {
  return (
    <div className={cn('animate-rise rounded-xl border border-line bg-surface p-3.5 sm:p-4', className)}>
      <div className="flex items-start gap-3">
        <span className="hidden h-10 w-10 shrink-0 min-[420px]:grid place-items-center rounded-xl border border-line bg-surface-2 text-ink [&>svg]:h-[18px] [&>svg]:w-[18px]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.84rem] text-ink-2">{label}</p>
          <div className="mt-1.5 flex items-end justify-between gap-2">
            <p className="truncate text-[1.45rem] leading-none font-semibold text-ink">
              {value}
              {unit && <span className="ml-1.5 text-[0.75rem] font-normal text-muted">{unit}</span>}
            </p>
            {change !== undefined && <Change value={change} />}
          </div>
        </div>
      </div>
      {meter && (
        <div className="mt-4 flex items-center gap-3">
          <Meter value={meter.percent} tone={meterTone(meter.percent)} className="flex-1" label={meter.label} />
          <span className="text-[0.75rem] text-ink-2 tabular-nums">{Math.round(meter.percent)} %</span>
        </div>
      )}
    </div>
  )
}

function Change({ value }: { value: number | null }) {
  // Rien à comparer le mois précédent : une variation n'aurait pas de sens.
  if (value === null) return null
  const up = value >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="shrink-0 text-right leading-tight">
      <span className={cn('flex items-center justify-end gap-0.5 text-[0.78rem] font-medium tabular-nums', up ? 'text-success' : 'text-danger')}>
        <Icon className="h-3.5 w-3.5" />
        {Math.abs(value)} %
      </span>
      <span className="text-[0.7rem] text-muted">ce mois</span>
    </span>
  )
}
