'use client'

import { BookOpen, Check, ChevronDown, LogOut, Settings, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { selectProject } from '@/app/(app)/actions'
import type { ShellProject } from '@/components/shell/sidebar'
import { authClient } from '@/lib/auth-client'
import { cn, initials } from '@/lib/utils'

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propriétaire',
  ADMIN: 'Administration',
  DEVELOPER: 'Développement',
  VIEWER: 'Lecture seule',
}

/**
 * Menu du compte, en haut à droite : comme sur la maquette, il affiche le
 * projet courant et permet d'en changer, à côté des accès au profil.
 */
export function AccountMenu({
  user,
  projects,
  current,
  role,
}: {
  user: { name: string; email: string }
  projects: ShellProject[]
  current: ShellProject | null
  role: string | null
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const root = useRef<HTMLDivElement>(null)

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

  async function signOut() {
    await authClient.signOut()
    router.push('/connexion')
    router.refresh()
  }

  const title = current?.name ?? user.name
  const subtitle = current ? (role ? ROLE_LABELS[role] ?? 'Projet' : 'Projet') : user.email

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-12 items-center gap-3 rounded-xl border border-line bg-surface px-2.5 transition-colors hover:border-line-strong sm:pr-3.5"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-3 text-[0.85rem] font-semibold text-ink">
          {initials(title)}
        </span>
        <span className="hidden min-w-0 flex-col text-left leading-tight sm:flex">
          <span className="max-w-40 truncate text-[0.84rem] font-medium text-ink">{title}</span>
          <span className="max-w-40 truncate text-[0.72rem] text-muted">{subtitle}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-muted sm:block" />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-pop absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-panel"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>

          {projects.length > 0 && (
            <div className="border-b border-line p-1.5">
              <p className="px-2.5 pt-1.5 pb-1 text-[0.7rem] font-medium tracking-wider text-muted uppercase">Projets</p>
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={project.id === current?.id}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await selectProject(project.id)
                      setOpen(false)
                      router.refresh()
                    })
                  }
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.84rem] text-ink hover:bg-surface-2"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-surface-3 text-[0.68rem] font-semibold">
                    {initials(project.name)}
                  </span>
                  <span className="flex-1 truncate">{project.name}</span>
                  <Check className={cn('h-4 w-4 text-accent', project.id !== current?.id && 'invisible')} />
                </button>
              ))}
            </div>
          )}

          <div className="p-1.5">
            {[
              { href: '/profil', label: 'Mon profil', icon: UserRound },
              { href: '/parametres', label: 'Paramètres', icon: Settings },
              { href: '/docs', label: 'Documentation API', icon: BookOpen },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.84rem] text-ink hover:bg-surface-2"
              >
                <item.icon className="h-4 w-4 text-ink-2" />
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.84rem] text-danger hover:bg-danger-soft"
            >
              <LogOut className="h-4 w-4" />
              Se déconnecter
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
