'use client'

import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Retour d'action (succès, erreur, information).
 *
 * Trois messages au plus à l'écran : au-delà, ils masquent l'interface sans
 * rien apprendre de plus. Une erreur est annoncée comme alerte aux lecteurs
 * d'écran ; les autres messages restent polis.
 */
type Tone = 'success' | 'error' | 'info'

interface Toast {
  id: number
  tone: Tone
  title: string
  description?: string
}

interface ToastApi {
  success(title: string, description?: string): void
  error(title: string, description?: string): void
  info(title: string, description?: string): void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast doit être utilisé dans ToastProvider.')
  return context
}

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info }
const TONES = { success: 'text-success', error: 'text-danger', info: 'text-accent' }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((items) => items.filter((item) => item.id !== id))
  }, [])

  const push = useCallback(
    (tone: Tone, title: string, description?: string) => {
      counter.current += 1
      const id = counter.current
      setToasts((items) => [...items.slice(-2), { id, tone, title, description }])
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4200)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description) => push('success', title, description),
      error: (title, description) => push('error', title, description),
      info: (title, description) => push('info', title, description),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.tone]
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className="animate-rise pointer-events-auto flex items-start gap-3 rounded-xl border border-line-strong bg-surface p-3.5 shadow-panel"
            >
              <Icon className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', TONES[toast.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{toast.title}</p>
                {toast.description && <p className="mt-0.5 text-[0.8rem] leading-relaxed text-ink-2">{toast.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-md p-0.5 text-muted hover:text-ink"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
