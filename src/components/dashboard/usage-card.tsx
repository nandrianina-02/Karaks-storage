'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { AreaChart, ColumnChart, type Point } from '@/components/charts/charts'
import { Select } from '@/components/ui/field'
import { formatBytes } from '@/lib/files/types'
import { cn, formatCount } from '@/lib/utils'

const PERIODS = [
  { value: 7, label: '7 derniers jours' },
  { value: 30, label: '30 derniers jours' },
  { value: 90, label: '90 derniers jours' },
]

/** Sélecteur de période : il porte sur toute la page, par l'adresse. */
export function PeriodSelect({ value, param = 'periode', className }: { value: number; param?: string; className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  return (
    <Select
      value={value}
      aria-label="Période"
      className={cn('h-9 w-auto min-w-40 text-[0.8rem]', pending && 'opacity-60', className)}
      onChange={(event) => {
        const next = new URLSearchParams(params)
        next.set(param, event.target.value)
        startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }))
      }}
    >
      {PERIODS.map((period) => (
        <option key={period.value} value={period.value}>
          {period.label}
        </option>
      ))}
    </Select>
  )
}

const FORMATS = {
  bytes: (value: number) => formatBytes(value),
  count: (value: number) => formatCount(value),
}

export function SeriesChart({
  kind,
  points,
  format,
  caption,
}: {
  kind: 'area' | 'columns'
  points: Point[]
  format: keyof typeof FORMATS
  caption: string
}) {
  const Chart = kind === 'area' ? AreaChart : ColumnChart
  return <Chart points={points} format={FORMATS[format]} caption={caption} />
}
