'use client'

import { Command, Menu, Search, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

import { AccountMenu } from '@/components/shell/account-menu'
import { CommandPalette } from '@/components/shell/command-palette'
import { NotificationsMenu } from '@/components/shell/notifications-menu'
import { Sidebar, type SidebarProps } from '@/components/shell/sidebar'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { UploadProvider } from '@/components/upload/upload-manager'
import { UploadTray } from '@/components/upload/upload-tray'

/**
 * Coque du tableau de bord (CDS 33) : barre latérale persistante sur grand
 * écran, tiroir sur téléphone, barre du haut avec recherche, notifications,
 * thème et compte.
 */
export function AppShell({
  children,
  user,
  role,
  ...sidebar
}: SidebarProps & {
  children: ReactNode
  user: { name: string; email: string }
  role: string | null
}) {
  const [drawer, setDrawer] = useState(false)
  const [palette, setPalette] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPalette((value) => !value)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Le tiroir se referme quand la page change.
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setDrawer(false)
  }

  return (
    <UploadProvider>
      <div className="min-h-screen lg:pl-[270px]">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[270px] border-r border-line bg-bg lg:block">
          <Sidebar {...sidebar} />
        </aside>

        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="animate-fade absolute inset-0 bg-[rgb(2_6_18/0.62)]" onClick={() => setDrawer(false)} />
            <aside className="animate-slide absolute inset-y-0 left-0 w-[min(290px,86vw)] border-r border-line bg-bg">
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="absolute top-6 right-3 grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2"
                aria-label="Fermer le menu"
              >
                <X className="h-5 w-5" />
              </button>
              <Sidebar {...sidebar} onNavigate={() => setDrawer(false)} />
            </aside>
          </div>
        )}

        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-line bg-bg/95 px-4 backdrop-blur-[2px] sm:px-6">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="grid h-10 w-10 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 lg:hidden"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => setPalette(true)}
            className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-surface px-3.5 text-left text-sm text-muted transition-colors hover:border-line-strong md:max-w-[42rem]"
          >
            <Search className="h-[18px] w-[18px] shrink-0 text-ink-2" />
            <span className="truncate">Rechercher un fichier, un dossier...</span>
            <kbd className="ml-auto hidden items-center gap-0.5 rounded-md border border-line px-1.5 py-0.5 font-sans text-[0.7rem] text-ink-2 sm:flex">
              <Command className="h-3 w-3" />K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <NotificationsMenu />
            <ThemeToggle />
            <span className="mx-1 hidden h-8 w-px bg-line sm:block" />
            <AccountMenu user={user} projects={sidebar.projects} current={sidebar.current} role={role} />
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-7">{children}</main>
      </div>

      {palette && (
        <CommandPalette onClose={() => setPalette(false)} project={sidebar.current?.id ?? null} permissions={sidebar.permissions} superAdmin={sidebar.superAdmin} />
      )}
      <UploadTray />
    </UploadProvider>
  )
}
