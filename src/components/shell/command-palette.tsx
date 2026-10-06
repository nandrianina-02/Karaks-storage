'use client'

import { ArrowRight, CornerDownLeft, FolderClosed, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { FileIcon } from '@/components/files/file-icon'
import { NAV_ITEMS } from '@/components/shell/nav-items'
import { api } from '@/lib/client/api'
import type { FileCategory } from '@/lib/files/types'
import { formatBytes } from '@/lib/files/types'
import type { Permission } from '@/lib/security/permissions'
import { cn } from '@/lib/utils'

/**
 * Recherche globale (⌘K / Ctrl K) : pages, dossiers et fichiers du projet.
 * Les fichiers sont cherchés par l'API, à mesure de la frappe, avec un léger
 * délai pour ne pas lancer une requête par caractère.
 */
interface Result {
  key: string
  label: string
  hint: string
  href: string
  kind: 'page' | 'folder' | 'file'
  category?: FileCategory
  icon?: (typeof NAV_ITEMS)[number]['icon']
}

export function CommandPalette({
  onClose,
  project,
  permissions,
}: {
  onClose: () => void
  project: string | null
  permissions: Permission[]
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const pages = useMemo<Result[]>(() => {
    const granted = new Set(permissions)
    const needle = query.trim().toLowerCase()
    return NAV_ITEMS.filter((item) => !item.permission || granted.has(item.permission))
      .filter((item) => !needle || item.label.toLowerCase().includes(needle))
      .map((item) => ({ key: item.href, label: item.label, hint: 'Page', href: item.href, kind: 'page' as const, icon: item.icon }))
  }, [query, permissions])

  useEffect(() => {
    input.current?.focus()
  }, [])

  useEffect(() => {
    const needle = query.trim()
    if (!project || needle.length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const [files, folders] = await Promise.all([
          api<{ files: { id: string; name: string; size: number; category: FileCategory }[] }>(
            `/api/v1/files?search=${encodeURIComponent(needle)}&limit=6`,
            { project, signal: controller.signal },
          ),
          api<{ folders: { id: string; name: string }[] }>(`/api/v1/folders`, { project, signal: controller.signal }).catch(
            () => ({ folders: [] }),
          ),
        ])
        setRemote([
          ...folders.folders
            .filter((folder) => folder.name.toLowerCase().includes(needle.toLowerCase()))
            .slice(0, 3)
            .map((folder) => ({
              key: folder.id,
              label: folder.name,
              hint: 'Dossier',
              href: `/fichiers?dossier=${folder.id}`,
              kind: 'folder' as const,
            })),
          ...files.files.map((file) => ({
            key: file.id,
            label: file.name,
            hint: formatBytes(file.size),
            href: `/fichiers/${file.id}`,
            kind: 'file' as const,
            category: file.category,
          })),
        ])
        setActive(0)
      } catch {
        // Recherche interrompue par la frappe suivante : rien à signaler.
      } finally {
        setLoading(false)
      }
    }, 180)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, project])

  // Résultats distants ignorés sous deux caractères : ils dateraient d'une
  // frappe précédente.
  const results = [...(query.trim().length >= 2 ? remote : []), ...pages]

  function go(result: Result | undefined) {
    if (!result) return
    onClose()
    router.push(result.href)
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]">
      <div className="animate-fade absolute inset-0 bg-[rgb(2_6_18/0.62)]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recherche"
        className="animate-rise relative w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-panel"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive((index) => Math.min(index + 1, results.length - 1))
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((index) => Math.max(index - 1, 0))
          }
          if (event.key === 'Enter') go(results[active])
        }}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-[18px] w-[18px] text-muted" />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un fichier, un dossier, une page..."
            className="h-14 flex-1 bg-transparent text-[0.95rem] text-ink placeholder:text-muted focus:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `palette-${results[active].key}` : undefined}
          />
          {loading && <span className="text-xs text-muted">Recherche...</span>}
        </div>
        <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-ink-2">Aucun résultat pour « {query} ».</li>
          )}
          {results.map((result, index) => {
            const Icon = result.icon
            return (
              <li
                key={`${result.kind}-${result.key}`}
                id={`palette-${result.key}`}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(result)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5',
                  index === active ? 'bg-surface-2' : '',
                )}
              >
                {result.kind === 'file' && result.category ? (
                  <FileIcon category={result.category} size="sm" />
                ) : result.kind === 'folder' ? (
                  <FileIcon category="folder" size="sm" />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface-3 text-ink-2">
                    {Icon ? <Icon className="h-3.5 w-3.5" /> : <FolderClosed className="h-3.5 w-3.5" />}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{result.label}</span>
                <span className="text-xs text-muted">{result.hint}</span>
                {index === active ? <CornerDownLeft className="h-3.5 w-3.5 text-muted" /> : <ArrowRight className="h-3.5 w-3.5 text-transparent" />}
              </li>
            )
          })}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
