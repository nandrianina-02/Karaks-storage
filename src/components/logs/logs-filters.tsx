'use client'

import { Search, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Input, Select } from '@/components/ui/field'
import { cn } from '@/lib/utils'

/** Filtres du journal, sur une ligne, au-dessus du tableau qu'ils portent. */
export function LogsFilters({ actions }: { actions: { value: string; label: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState(params.get('q') ?? '')

  function set(change: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(change)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    next.delete('page')
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false }))
  }

  const active = params.get('action') || params.get('resultat') || params.get('q')

  return (
    <div className={cn('flex flex-wrap items-center gap-2.5', pending && 'opacity-70')}>
      <form
        className="relative min-w-56 flex-1 sm:max-w-xs"
        onSubmit={(event) => {
          event.preventDefault()
          set({ q: search.trim() || null })
        }}
      >
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Fichier, adresse email..." className="h-9 pl-9 text-[0.84rem]" aria-label="Rechercher dans le journal" />
      </form>
      <Select value={params.get('action') ?? ''} onChange={(event) => set({ action: event.target.value || null })} className="h-9 w-auto min-w-48 text-[0.84rem]" aria-label="Action">
        <option value="">Toutes les actions</option>
        {actions.map((action) => (
          <option key={action.value} value={action.value}>
            {action.label}
          </option>
        ))}
      </Select>
      <Select value={params.get('resultat') ?? ''} onChange={(event) => set({ resultat: event.target.value || null })} className="h-9 w-auto min-w-36 text-[0.84rem]" aria-label="Résultat">
        <option value="">Tous les résultats</option>
        <option value="SUCCESS">Réussites</option>
        <option value="FAILURE">Échecs</option>
      </Select>
      {active && (
        <button
          type="button"
          onClick={() => {
            setSearch('')
            set({ q: null, action: null, resultat: null })
          }}
          className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[0.8rem] text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
          Effacer les filtres
        </button>
      )}
    </div>
  )
}
