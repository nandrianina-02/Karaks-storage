import { cn } from '@/lib/utils'

/**
 * Chargement propre à Karaks Storage : trois plateaux qui se remplissent
 * l'un après l'autre. Utilisé pour les changements de page et les attentes
 * longues ; les boutons ont leur propre indicateur, plus discret.
 */
export function Loader({ label = 'Chargement', className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center gap-4', className)}>
      <div className="flex w-14 flex-col gap-1.5" aria-hidden="true">
        <span className="loader-shelf h-1.5 rounded-full bg-accent" />
        <span className="loader-shelf h-1.5 w-4/5 rounded-full bg-accent" />
        <span className="loader-shelf h-1.5 w-3/5 rounded-full bg-accent" />
      </div>
      <span className="text-xs font-medium tracking-[0.2em] text-muted uppercase">{label}</span>
    </div>
  )
}

/** Indicateur en ligne, pour un bouton ou une cellule. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn('animate-spin-slow h-4 w-4', className)} aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
