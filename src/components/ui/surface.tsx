import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Panneau de contenu : surface, filet, coins modérés. */
export function Card({ className, ...props }: ComponentProps<'section'>) {
  // min-w-0 : dans une grille, un graphique ou un tableau large ne doit pas
  // élargir la colonne au-delà de l'écran.
  return <section className={cn('min-w-0 rounded-xl border border-line bg-surface', className)} {...props} />
}

export function CardHeader({
  title,
  description,
  icon,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-center gap-3 px-5 pt-4 pb-3', className)}>
      {icon && <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-ink-2 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h2 className="text-[0.95rem] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

/** En-tête de page : titre, phrase d'usage, actions alignées à droite. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('animate-rise flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  )
}

const BADGE_TONES = {
  neutral: 'bg-surface-3 text-ink-2',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: keyof typeof BADGE_TONES
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.72rem] font-medium whitespace-nowrap [&>svg]:h-3 [&>svg]:w-3',
        BADGE_TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/** État vide : dit ce qui manque et propose l'action qui le remplit. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('animate-fade flex flex-col items-center px-6 py-12 text-center', className)}>
      <span className="grid h-12 w-12 place-items-center rounded-xl border border-line bg-surface-2 text-ink-2 [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </span>
      <p className="mt-4 text-[0.95rem] font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Barre de progression, avec une piste dans la même teinte. */
export function Meter({ value, tone = 'accent', className, label }: { value: number; tone?: 'accent' | 'warning' | 'danger'; className?: string; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  const color = tone === 'danger' ? 'bg-danger' : tone === 'warning' ? 'bg-warning' : 'bg-accent'
  const track = tone === 'danger' ? 'bg-danger-soft' : tone === 'warning' ? 'bg-warning-soft' : 'bg-accent-soft'
  return (
    <div
      className={cn('h-2 overflow-hidden rounded-full', track, className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${clamped}%` }} />
    </div>
  )
}

/** Couleur d'une jauge de remplissage : on prévient avant la saturation. */
export function meterTone(percent: number): 'accent' | 'warning' | 'danger' {
  return percent >= 90 ? 'danger' : percent >= 75 ? 'warning' : 'accent'
}
