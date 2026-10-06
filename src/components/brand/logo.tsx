import { cn } from '@/lib/utils'

/**
 * Marque de Karaks Storage : un K dont les deux branches sont des plateaux
 * empilés, qui rappelle à la fois Karaks et le rangement. Le dégradé est
 * réservé à cette marque.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('h-9 w-9', className)} aria-hidden="true">
      <defs>
        <linearGradient id="ks-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--logo-from)" />
          <stop offset="1" stopColor="var(--logo-to)" />
        </linearGradient>
      </defs>
      <rect x="5" y="4" width="7" height="32" rx="2" fill="url(#ks-mark)" />
      <path d="M15 19.2 28.6 5.2c.4-.4.9-.6 1.4-.6h5.6L20.8 20 15 19.2Z" fill="url(#ks-mark)" />
      <path d="M15 20.8 20.8 20l14.8 15.4H30c-.5 0-1-.2-1.4-.6L15 20.8Z" fill="url(#ks-mark)" opacity="0.72" />
    </svg>
  )
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <LogoMark />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-[1.35rem] font-semibold tracking-[0.18em] text-ink">KARAKS</span>
          <span className="mt-1 font-display text-[0.62rem] font-medium tracking-[0.42em] text-ink-2">STORAGE</span>
        </span>
      )}
    </span>
  )
}
