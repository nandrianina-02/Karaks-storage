'use client'

import { MoreHorizontal } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/utils'

/**
 * Menu d'actions ancré à un bouton.
 *
 * Rendu dans un portail, en position fixe : dans un tableau, un menu
 * ordinaire serait recouvert par les lignes suivantes ou coupé par le
 * défilement du conteneur. Il s'ouvre vers le haut quand la place manque.
 */
export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
  separatorBefore?: boolean
}

export function ActionMenu({
  items,
  label = 'Actions',
  trigger,
  align = 'end',
  className,
}: {
  items: MenuItem[]
  label?: string
  trigger?: ReactNode
  align?: 'start' | 'end'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; up: boolean } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !button.current) return
    const place = () => {
      const rect = button.current!.getBoundingClientRect()
      const height = menu.current?.offsetHeight ?? items.length * 38 + 12
      const up = window.innerHeight - rect.bottom < height + 12 && rect.top > height + 12
      const width = menu.current?.offsetWidth ?? 208
      const left = align === 'end' ? rect.right - width : rect.left
      setPosition({
        top: up ? rect.top - height - 6 : rect.bottom + 6,
        left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
        up,
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, items.length, align])

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const entries = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])]
        const index = entries.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1
        entries[(next + entries.length) % entries.length]?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className={cn(
          trigger
            ? ''
            : 'grid h-8 w-8 place-items-center rounded-md text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink',
          open && !trigger && 'bg-surface-3 text-ink',
          className,
        )}
      >
        {trigger ?? <MoreHorizontal className="h-[18px] w-[18px]" />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            style={{ top: position?.top ?? -9999, left: position?.left ?? -9999 }}
            className={cn(
              'animate-pop fixed z-[95] min-w-52 rounded-xl border border-line-strong bg-surface p-1.5 shadow-panel',
              position?.up && 'origin-bottom-right',
            )}
            onClick={(event) => event.stopPropagation()}
          >
            {items.map((item) => (
              <div key={item.label}>
                {item.separatorBefore && <div className="my-1 h-px bg-line" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false)
                    item.onSelect()
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.84rem] transition-colors disabled:opacity-40',
                    item.tone === 'danger' ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-surface-2',
                  )}
                >
                  <span className="grid h-4 w-4 place-items-center [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
