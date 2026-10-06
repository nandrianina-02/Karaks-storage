'use client'

import { BookOpen, ChevronDown, Layers } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { selectProject } from '@/app/(app)/actions'
import { Logo } from '@/components/brand/logo'
import { NAV_ITEMS } from '@/components/shell/nav-items'
import { Meter, meterTone } from '@/components/ui/surface'
import { useToast } from '@/components/ui/toast'
import { formatBytes } from '@/lib/files/types'
import type { Permission } from '@/lib/security/permissions'
import { cn } from '@/lib/utils'

export interface ShellProject {
  id: string
  name: string
}

export interface SidebarProps {
  permissions: Permission[]
  projects: ShellProject[]
  current: ShellProject | null
  storage: { used: number; limit: number | null } | null
  onNavigate?: () => void
}

export function Sidebar({ permissions, projects, current, storage, onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const granted = new Set(permissions)

  const items = NAV_ITEMS.filter((item) => !item.permission || granted.has(item.permission))
  const percent = storage?.limit ? (storage.used / storage.limit) * 100 : 0

  function switchProject(id: string) {
    startTransition(async () => {
      const result = await selectProject(id)
      if (!result.ok) toast.error('Projet indisponible')
      router.refresh()
      onNavigate?.()
    })
  }

  return (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" className="flex h-[84px] shrink-0 items-center px-6" onClick={onNavigate}>
        <Logo />
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-4" aria-label="Navigation principale">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`) ||
              item.match?.some((prefix) => pathname.startsWith(prefix))
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-11 items-center gap-3.5 rounded-lg px-3.5 text-[0.92rem] transition-colors',
                    active ? 'bg-accent font-medium text-accent-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="space-y-3 px-4 pb-5">
        <Link
          href="/docs"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.82rem] text-ink-2 transition-colors hover:text-ink"
        >
          <BookOpen className="h-4 w-4" />
          Documentation API
        </Link>

        {projects.length > 0 && (
          <label className="relative block rounded-xl border border-line bg-surface-2/60 px-3.5 pt-2.5 pb-2.5 transition-colors focus-within:border-accent hover:border-line-strong">
            <span className="block text-[0.7rem] text-muted">Projet actuel</span>
            <span className="mt-1 flex items-center gap-2 text-[0.9rem] font-medium text-ink">
              <Layers className="h-4 w-4 text-ink-2" />
              <span className="truncate">{current?.name ?? 'Aucun projet'}</span>
              <ChevronDown className="ml-auto h-4 w-4 text-muted" />
            </span>
            <select
              className="absolute inset-0 cursor-pointer opacity-0"
              value={current?.id ?? ''}
              disabled={pending}
              onChange={(event) => switchProject(event.target.value)}
              aria-label="Changer de projet"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {storage && (
          <div className="rounded-xl border border-line bg-surface-2/60 px-3.5 py-3">
            <p className="text-[0.78rem] text-ink-2">Stockage utilisé</p>
            <Meter value={percent} tone={meterTone(percent)} className="mt-2.5" label="Stockage utilisé" />
            <p className="mt-2 flex items-center justify-between text-[0.75rem] text-ink-2 tabular-nums">
              <span>
                {formatBytes(storage.used)}
                {storage.limit ? <span className="text-muted"> / {formatBytes(storage.limit)}</span> : null}
              </span>
              {storage.limit ? <span>{Math.round(percent)} %</span> : null}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
