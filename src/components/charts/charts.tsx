'use client'

import { Table2 } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Graphiques du tableau de bord.
 *
 * Une série par graphique, donc une seule teinte — l'accent — et pas de
 * légende : le titre dit ce qui est tracé. L'interaction fait partie du
 * graphique : réticule et info-bulle sur l'aire, info-bulle par colonne.
 * Toutes les valeurs restent lisibles sans survol, par la vue tableau.
 */
export interface Point {
  label: string
  value: number
  /** Libellé long de l'info-bulle (« lundi 6 octobre »). */
  detail?: string
}

const HEIGHT = 220
const PAD = { top: 12, right: 12, bottom: 28, left: 52 }

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  // Largeur de départ modeste : le premier rendu ne doit pas déborder d'un
  // écran de téléphone avant la première mesure.
  const [width, setWidth] = useState(320)
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

/** Graduations rondes : 0, 25, 50, 75, 100 plutôt que 0, 23,7, 47,4... */
function niceScale(max: number, ticks = 4) {
  if (max <= 0) return { top: 1, step: 0.25 }
  const raw = max / ticks
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? raw
  return { top: step * ticks, step }
}

function Tooltip({ x, y, width, title, value }: { x: number; y: number; width: number; title: string; value: string }) {
  const left = Math.min(Math.max(x - 70, 0), width - 140)
  return (
    <div
      className="pointer-events-none absolute z-10 w-[140px] rounded-lg border border-line-strong bg-surface px-3 py-2 shadow-panel"
      style={{ left, top: Math.max(0, y - 64) }}
    >
      <p className="text-[0.95rem] font-semibold text-ink tabular-nums">{value}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[0.72rem] text-ink-2">
        <span className="h-0.5 w-3 rounded-full bg-accent" />
        {title}
      </p>
    </div>
  )
}

function DataTable({ points, format, caption }: { points: Point[]; format: (value: number) => string; caption: string }) {
  return (
    <div className="max-h-[220px] overflow-y-auto">
      <table className="w-full text-left text-[0.8rem]">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface text-muted">
          <tr>
            <th className="py-1.5 font-medium">Période</th>
            <th className="py-1.5 text-right font-medium">Valeur</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.label} className="border-t border-line">
              <td className="py-1.5 text-ink-2">{point.detail ?? point.label}</td>
              <td className="py-1.5 text-right text-ink tabular-nums">{format(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChartFrame({
  children,
  table,
  showTable,
  onToggle,
  toggle = true,
}: {
  children: React.ReactNode
  table: React.ReactNode
  showTable: boolean
  onToggle: () => void
  toggle?: boolean
}) {
  return (
    <div className="relative">
      {toggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={showTable}
          className={cn(
            'absolute -top-1 right-0 z-10 flex items-center gap-1 rounded-md px-1.5 py-1 text-[0.72rem] transition-colors',
            showTable ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink',
          )}
        >
          <Table2 className="h-3.5 w-3.5" />
          Données
        </button>
      )}
      {showTable ? <div className="pt-6">{table}</div> : children}
    </div>
  )
}

function axisLabels(points: Point[], width: number) {
  const plot = width - PAD.left - PAD.right
  // Au plus une étiquette tous les 56 px : en dessous, elles se chevauchent.
  const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plot / 56))))
  const last = points.length - 1
  // La dernière date compte (c'est aujourd'hui), mais elle ne doit pas
  // chevaucher la graduation régulière qui la précède.
  const lastFits = last % every === 0 || last % every >= every * 0.6
  return points.map((point, index) => {
    if (index === last) return lastFits ? point.label : null
    return index % every === 0 ? point.label : null
  })
}

export function AreaChart({
  points,
  format,
  caption,
  className,
}: {
  points: Point[]
  format: (value: number) => string
  caption: string
  className?: string
}) {
  const { ref, width } = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const gradient = useId()

  const { top, step } = niceScale(Math.max(...points.map((point) => point.value), 0))
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (index: number) => PAD.left + (points.length <= 1 ? plotW / 2 : (index / (points.length - 1)) * plotW)
  const y = (value: number) => PAD.top + plotH - (value / top) * plotH

  const path = useMemo(() => {
    if (points.length === 0) return ''
    // Courbe lissée (Catmull-Rom vers Bézier), sans dépasser les valeurs.
    const coords = points.map((point, index) => [x(index), y(point.value)] as const)
    let d = `M${coords[0][0]},${coords[0][1]}`
    for (let i = 0; i < coords.length - 1; i += 1) {
      const [x0, y0] = coords[Math.max(0, i - 1)]
      const [x1, y1] = coords[i]
      const [x2, y2] = coords[i + 1]
      const [x3, y3] = coords[Math.min(coords.length - 1, i + 2)]
      const c1y = Math.min(PAD.top + plotH, Math.max(PAD.top, y1 + (y2 - y0) / 6))
      const c2y = Math.min(PAD.top + plotH, Math.max(PAD.top, y2 - (y3 - y1) / 6))
      d += ` C${x1 + (x2 - x0) / 6},${c1y} ${x2 - (x3 - x1) / 6},${c2y} ${x2},${y2}`
    }
    return d
    // Les fonctions x et y dépendent de width et top, déjà listés.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, width, top])

  const labels = axisLabels(points, width)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step)

  function onMove(event: React.PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - box.left) / box.width
    setHover(Math.round(ratio * (points.length - 1)))
  }

  return (
    <ChartFrame
      showTable={showTable}
      onToggle={() => setShowTable((value) => !value)}
      table={<DataTable points={points} format={format} caption={caption} />}
    >
      <div ref={ref} className={cn('relative w-full min-w-0 overflow-hidden', className)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={caption} className="block overflow-visible">
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--chart-grid)" strokeWidth="1" />
              <text x={PAD.left - 10} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted text-[0.68rem] tabular-nums">
                {format(tick)}
              </text>
            </g>
          ))}
          {path && (
            <>
              <path d={`${path} L${x(points.length - 1)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`} fill={`url(#${gradient})`} />
              <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
          {labels.map((label, index) =>
            label ? (
              <text key={index} x={x(index)} y={HEIGHT - 8} textAnchor="middle" className="fill-muted text-[0.68rem]">
                {label}
              </text>
            ) : null,
          )}
          {hover !== null && points[hover] && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--line-strong)" strokeWidth="1" />
              <circle cx={x(hover)} cy={y(points[hover].value)} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
            </g>
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hover !== null && points[hover] && (
          <Tooltip
            x={x(hover)}
            y={y(points[hover].value)}
            width={width}
            title={points[hover].detail ?? points[hover].label}
            value={format(points[hover].value)}
          />
        )}
      </div>
    </ChartFrame>
  )
}

export function ColumnChart({
  points,
  format,
  caption,
  className,
}: {
  points: Point[]
  format: (value: number) => string
  caption: string
  className?: string
}) {
  const { ref, width } = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const { top, step } = niceScale(Math.max(...points.map((point) => point.value), 0))
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const band = plotW / Math.max(1, points.length)
  const barW = Math.min(24, Math.max(4, band - 2))
  const y = (value: number) => PAD.top + plotH - (value / top) * plotH
  const labels = axisLabels(points, width)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step)

  return (
    <ChartFrame
      showTable={showTable}
      onToggle={() => setShowTable((value) => !value)}
      table={<DataTable points={points} format={format} caption={caption} />}
    >
      <div ref={ref} className={cn('relative w-full min-w-0 overflow-hidden', className)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={caption} className="block overflow-visible">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--chart-grid)" strokeWidth="1" />
              <text x={PAD.left - 10} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted text-[0.68rem] tabular-nums">
                {format(tick)}
              </text>
            </g>
          ))}
          {points.map((point, index) => {
            const cx = PAD.left + band * index + band / 2
            const h = Math.max(point.value > 0 ? 2 : 0, PAD.top + plotH - y(point.value))
            const radius = Math.min(4, h / 2, barW / 2)
            const x0 = cx - barW / 2
            const yTop = PAD.top + plotH - h
            // Coin arrondi côté valeur, carré sur la ligne de base.
            const d =
              h <= 0
                ? ''
                : `M${x0},${PAD.top + plotH} V${yTop + radius} Q${x0},${yTop} ${x0 + radius},${yTop} H${x0 + barW - radius} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + radius} V${PAD.top + plotH} Z`
            return (
              <g key={point.label}>
                {d && <path d={d} fill="var(--accent)" opacity={hover === null || hover === index ? 1 : 0.55} />}
                <rect
                  x={PAD.left + band * index}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${point.detail ?? point.label} : ${format(point.value)}`}
                  onPointerEnter={() => setHover(index)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(index)}
                  onBlur={() => setHover(null)}
                />
              </g>
            )
          })}
          {labels.map((label, index) =>
            label ? (
              <text
                key={index}
                x={PAD.left + band * index + band / 2}
                y={HEIGHT - 8}
                textAnchor="middle"
                className="fill-muted text-[0.68rem]"
              >
                {label}
              </text>
            ) : null,
          )}
        </svg>
        {hover !== null && points[hover] && (
          <Tooltip
            x={PAD.left + band * hover + band / 2}
            y={y(points[hover].value)}
            width={width}
            title={points[hover].detail ?? points[hover].label}
            value={format(points[hover].value)}
          />
        )}
      </div>
    </ChartFrame>
  )
}
