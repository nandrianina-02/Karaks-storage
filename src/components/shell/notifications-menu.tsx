'use client'

import {
  Bell,
  CheckCheck,
  CloudUpload,
  Crown,
  KeyRound,
  Layers,
  ShieldAlert,
  Trash2,
  Undo2,
  Unplug,
  UserPlus,
  Webhook,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Loader } from '@/components/brand/loader'
import { api } from '@/lib/client/api'
import { cn, formatRelative } from '@/lib/utils'

/**
 * Cloche de notifications : les événements marquants des projets du compte,
 * tirés du journal. L'ouverture marque l'ensemble comme lu.
 */
interface Notification {
  id: string
  action: string
  label: string
  target: string | null
  project: string | null
  actor: string | null
  unread: boolean
  createdAt: string
}

const ICONS: Record<string, typeof Bell> = {
  UPLOAD: CloudUpload,
  DELETE: Trash2,
  DELETE_PERMANENT: Trash2,
  RESTORE: Undo2,
  CREATE_API_KEY: KeyRound,
  REVOKE_API_KEY: KeyRound,
  CREATE_PROJECT: Layers,
  DELETE_PROJECT: Trash2,
  CONNECT_PROVIDER: Unplug,
  CREATE_WEBHOOK: Webhook,
  LOGIN_FAILED: ShieldAlert,
  ADD_MEMBER: UserPlus,
  TRANSFER_OWNERSHIP: Crown,
}

export function NotificationsMenu() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[] | null>(null)
  const [unread, setUnread] = useState(0)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      api<{ items: Notification[]; unread: number }>('/api/v1/me/notifications')
        .then((data) => {
          if (!alive) return
          setItems(data.items)
          setUnread(data.unread)
        })
        .catch(() => alive && setItems([]))
    void load()
    // Relevé chaque minute : l'activité d'un projet vient aussi des clés API.
    const timer = setInterval(() => void load(), 60_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && unread > 0) {
      setUnread(0)
      await api('/api/v1/me/notifications', { method: 'POST' }).catch(() => undefined)
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} non lues` : 'Notifications'}
        className="relative grid h-10 w-10 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute top-2 right-2.5 h-2 w-2 rounded-full bg-danger ring-2 ring-bg" />}
      </button>

      {open && (
        <div className="animate-pop absolute right-0 z-50 mt-2 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line-strong bg-surface shadow-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            <span className="flex items-center gap-1 text-xs text-muted">
              <CheckCheck className="h-3.5 w-3.5" />
              Tout est lu
            </span>
          </div>
          <div className="max-h-[22rem] overflow-y-auto">
            {items === null ? (
              <Loader className="py-8" />
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-ink-2">Aucune activité pour l’instant.</p>
            ) : (
              <ul>
                {items.map((item) => {
                  const Icon = ICONS[item.action] ?? Bell
                  return (
                    <li key={item.id} className="flex gap-3 border-b border-line px-4 py-3 last:border-b-0">
                      <span
                        className={cn(
                          'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                          item.action === 'LOGIN_FAILED' ? 'bg-danger-soft text-danger' : 'bg-surface-3 text-ink-2',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.84rem] text-ink">
                          {item.label}
                          {item.target && <span className="text-ink-2"> — {item.target}</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {[item.project, item.actor, formatRelative(item.createdAt)].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      {item.unread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Non lue" />}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
