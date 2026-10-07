'use client'

import { X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/utils'

/**
 * Dialogue modal.
 *
 * Échap ferme, le focus entre dans le dialogue à l'ouverture et revient à
 * l'élément d'origine à la fermeture : sans ce retour, un utilisateur au
 * clavier se retrouve en haut de la page après chaque action.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  icon?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // La fonction de fermeture change à chaque rendu chez la plupart des
  // appelants. Si l'effet d'ouverture en dépendait, il se rejouerait à chaque
  // frappe dans un champ : le focus repartait vers l'élément d'origine puis
  // revenait au premier champ, et la saisie se perdait. On la lit donc par
  // une référence, et l'effet ne dépend que de l'ouverture.
  const close = useRef(onClose)
  useLayoutEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
      if (event.key === 'Tab' && panel.current) {
        const focusable = panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const target = panel.current?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button')
    target?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="animate-fade absolute inset-0 bg-[rgb(2_6_18/0.62)]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'animate-rise relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line-strong bg-surface shadow-panel sm:rounded-2xl',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
        )}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          {icon && <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-1 text-[0.82rem] leading-relaxed text-ink-2">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Fermer">
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
