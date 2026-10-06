import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

/** « 06 oct. 2026, 14:32 », comme sur la maquette. */
export function formatDate(value: string | Date): string {
  return dateFormat.format(new Date(value)).replace(' à ', ', ')
}

export function formatDay(value: string | Date): string {
  return dayFormat.format(new Date(value))
}

const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

/** « il y a 2 heures » : pour l'activité récente, la date exacte compte moins. */
export function formatRelative(value: string | Date, now = Date.now()): string {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'à l’instant'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour')
  if (abs < 86_400 * 30) return relative.format(Math.round(seconds / 86_400), 'day')
  return formatDate(value)
}

/** Durée d'un média : « 3:52 », « 1:02:10 ». */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—'
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('fr-FR')

/** 48 291 en dessous de 100 000, « 1,2 M » au-delà. */
export function formatCount(value: number): string {
  return value >= 100_000 ? compact.format(value) : integer.format(value)
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase() || 'K'
}
