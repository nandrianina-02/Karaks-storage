'use client'

import { Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { cn } from '@/lib/utils'

function current(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

export function setTheme(theme: 'light' | 'dark' | 'system') {
  try {
    if (theme === 'system') localStorage.removeItem('ks-theme')
    else localStorage.setItem('ks-theme', theme)
  } catch {
    // Stockage indisponible (navigation privée) : le choix vaut pour la page.
  }
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme
  document.documentElement.setAttribute('data-theme', resolved)
}

export function useTheme() {
  return useSyncExternalStore(subscribe, current, () => 'dark' as const)
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={cn(
        'grid h-10 w-10 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink',
        className,
      )}
      aria-label={next === 'light' ? 'Passer au thème clair' : 'Passer au thème sombre'}
      title={next === 'light' ? 'Thème clair' : 'Thème sombre'}
    >
      {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  )
}
