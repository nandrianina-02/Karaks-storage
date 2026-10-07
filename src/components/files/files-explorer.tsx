'use client'

import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  CloudUpload,
  Download,
  FolderInput,
  FolderPlus,
  House,
  LayoutGrid,
  Link2,
  List,
  PencilLine,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState, useTransition, type ReactNode } from 'react'

import { FileDialogs, type FileDialog } from '@/components/files/file-dialogs'
import { CATEGORY_LABELS, FileIcon } from '@/components/files/file-icon'
import { FilePanel, type ProviderInfo } from '@/components/files/file-panel'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select } from '@/components/ui/field'
import { ActionMenu, type MenuItem } from '@/components/ui/menu'
import { EmptyState } from '@/components/ui/surface'
import { useToast } from '@/components/ui/toast'
import { useUploads } from '@/components/upload/upload-manager'
import type { FileDto, FolderDto } from '@/lib/api/serialize'
import { api, downloadUrl, errorMessage, streamUrl } from '@/lib/client/api'
import { ACCEPT_ATTRIBUTE, formatBytes } from '@/lib/files/types'
import type { Permission } from '@/lib/security/permissions'
import { cn, formatDate } from '@/lib/utils'

export interface ExplorerQuery {
  search: string
  sort: 'updatedAt' | 'createdAt' | 'name' | 'size' | 'type'
  view: 'list' | 'grid'
  trash: boolean
  page: number
}

const SORTS: { value: ExplorerQuery['sort']; label: string }[] = [
  { value: 'updatedAt', label: 'Dernière modification' },
  { value: 'createdAt', label: 'Date d’ajout' },
  { value: 'name', label: 'Nom' },
  { value: 'size', label: 'Taille' },
  { value: 'type', label: 'Type' },
]

/**
 * Gestionnaire de fichiers (CDS 6.2, maquette « Fichiers »).
 *
 * Les données viennent du serveur, par l'adresse (dossier, recherche, tri,
 * page) : un lien copié ouvre la même vue. Les actions passent par l'API v1,
 * puis la page est rafraîchie.
 */
export function FilesExplorer({
  project,
  provider,
  permissions,
  folderId,
  path,
  folders,
  files,
  total,
  limit,
  query,
  initialSelected,
  stats,
  bottom,
  trashRetentionDays,
}: {
  project: string
  provider: ProviderInfo
  permissions: Permission[]
  folderId: string | null
  path: { id: string; name: string }[]
  folders: FolderDto[]
  files: FileDto[]
  total: number
  limit: number
  query: ExplorerQuery
  initialSelected: FileDto | null
  stats: ReactNode
  bottom: ReactNode
  trashRetentionDays: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const toast = useToast()
  const uploads = useUploads()
  const [pending, startTransition] = useTransition()
  const can = new Set(permissions)

  const [selected, setSelected] = useState<FileDto | null>(initialSelected)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<FileDialog>(null)
  const [newFolder, setNewFolder] = useState(false)
  const [searchOpen, setSearchOpen] = useState(Boolean(query.search))
  const [search, setSearch] = useState(query.search)
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  // Les données changent avec l'adresse : on garde la sélection à jour.
  const [lastFiles, setLastFiles] = useState(files)
  if (files !== lastFiles) {
    setLastFiles(files)
    setChecked(new Set())
    if (selected) setSelected(files.find((file) => file.id === selected.id) ?? (initialSelected?.id === selected.id ? initialSelected : null))
  }

  function navigate(change: Record<string, string | null>, keepSelection = false) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(change)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    if (!('page' in change)) next.delete('page')
    if (!keepSelection) next.delete('fichier')
    startTransition(() => router.push(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false }))
  }

  function select(file: FileDto | null) {
    setSelected(file)
    const next = new URLSearchParams(params)
    if (file) next.set('fichier', file.id)
    else next.delete('fichier')
    window.history.replaceState(null, '', `${pathname}${next.size ? `?${next}` : ''}`)
  }

  function refresh(change?: { removed?: string[]; updated?: FileDto[] }) {
    if (change?.removed?.includes(selected?.id ?? '')) select(null)
    const updated = change?.updated?.find((file) => file.id === selected?.id)
    if (updated) setSelected(updated)
    startTransition(() => router.refresh())
  }

  async function restore(file: FileDto) {
    try {
      await api(`/api/v1/files/${file.id}/restore`, { method: 'POST', project })
      toast.success('Fichier restauré', file.name)
      refresh({ removed: [file.id] })
    } catch (error) {
      toast.error('Restauration impossible', errorMessage(error))
    }
  }

  function upload(list: FileList | File[]) {
    const items = [...list]
    if (items.length === 0) return
    uploads.add(items, { project, folderId, folderName: path.at(-1)?.name ?? 'la racine' })
  }

  const current = path.at(-1)
  const checkedFiles = files.filter((file) => checked.has(file.id))
  const allChecked = files.length > 0 && checked.size === files.length
  const showFolders = !query.trash && !query.search && query.page === 1
  const visibleFolders = showFolders ? folders : []
  const empty = files.length === 0 && visibleFolders.length === 0
  const from = (query.page - 1) * limit + 1
  const to = Math.min(total, query.page * limit)

  function rowActions(file: FileDto): MenuItem[] {
    if (file.status === 'trashed') {
      return [
        ...(can.has('files:delete') ? [{ label: 'Restaurer', icon: <RotateCcw />, onSelect: () => void restore(file) }] : []),
        ...(can.has('files:delete')
          ? [{ label: 'Supprimer définitivement', icon: <Trash2 />, tone: 'danger' as const, onSelect: () => setDialog({ kind: 'destroy', files: [file] }) }]
          : []),
      ]
    }
    return [
      { label: 'Afficher le détail', icon: <ArrowRight />, onSelect: () => select(file) },
      ...(can.has('links:create') ? [{ label: 'Lien temporaire', icon: <Link2 />, onSelect: () => setDialog({ kind: 'link', file }) }] : []),
      ...(can.has('download:read')
        ? [{ label: 'Télécharger', icon: <Download />, onSelect: () => (window.location.href = downloadUrl(project, file.id)) }]
        : []),
      ...(can.has('files:update')
        ? [
            { label: 'Renommer', icon: <PencilLine />, onSelect: () => setDialog({ kind: 'rename', file }) },
            { label: 'Déplacer', icon: <FolderInput />, onSelect: () => setDialog({ kind: 'move', files: [file] }) },
          ]
        : []),
      ...(can.has('files:delete')
        ? [{ label: 'Mettre à la corbeille', icon: <Trash2 />, tone: 'danger' as const, separatorBefore: true, onSelect: () => setDialog({ kind: 'trash', files: [file] }) }]
        : []),
    ]
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        <div className="animate-rise flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-ink">
              {query.trash ? 'Corbeille' : 'Fichiers'}
            </h1>
            <p className="mt-1 text-sm text-ink-2">
              {query.trash
                ? `Fichiers retirés de la diffusion, restaurables pendant ${trashRetentionDays} jours, puis supprimés définitivement.`
                : 'Gérez vos fichiers et dossiers en toute simplicité.'}
            </p>
          </div>
          {!query.trash && (
            <div className="flex flex-wrap gap-2.5">
              {can.has('folders:write') && (
                <Button icon={<FolderPlus className="h-[18px] w-[18px]" />} onClick={() => setNewFolder(true)}>
                  Nouveau dossier
                </Button>
              )}
              {can.has('files:upload') && (
                <Button variant="primary" icon={<CloudUpload className="h-[18px] w-[18px]" />} onClick={() => picker.current?.click()}>
                  Téléverser
                </Button>
              )}
              <input
                ref={picker}
                type="file"
                multiple
                accept={ACCEPT_ATTRIBUTE}
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) upload(event.target.files)
                  event.target.value = ''
                }}
              />
            </div>
          )}
        </div>

        {stats}

        <section
          className={cn('animate-rise stagger-2 relative rounded-xl border border-line bg-surface', pending && 'opacity-70 transition-opacity')}
          onDragEnter={(event) => {
            if (!can.has('files:upload') || query.trash || !event.dataTransfer.types.includes('Files')) return
            dragDepth.current += 1
            setDragging(true)
          }}
          onDragOver={(event) => {
            if (dragging) event.preventDefault()
          }}
          onDragLeave={() => {
            dragDepth.current -= 1
            if (dragDepth.current <= 0) setDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            dragDepth.current = 0
            setDragging(false)
            upload(event.dataTransfer.files)
          }}
        >
          {dragging && (
            <div className="animate-fade pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-accent-soft">
              <p className="flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-ink shadow-panel">
                <CloudUpload className="h-[18px] w-[18px] text-accent" />
                Déposer pour téléverser dans {current?.name ?? 'la racine du projet'}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
            <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-sm" aria-label="Fil d’Ariane">
              <button
                type="button"
                onClick={() => navigate({ dossier: null, q: null, corbeille: null })}
                className="grid h-8 w-8 place-items-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
                aria-label="Racine du projet"
              >
                <House className="h-[18px] w-[18px]" />
              </button>
              <span className="text-muted">/</span>
              {query.trash ? (
                <span className="font-medium text-ink">Corbeille</span>
              ) : path.length === 0 ? (
                <span className="font-medium text-ink">Tous les fichiers</span>
              ) : (
                path.map((step, index) => (
                  <span key={step.id} className="flex min-w-0 items-center gap-1.5">
                    {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />}
                    {index === path.length - 1 ? (
                      <span className="truncate font-medium text-ink">{step.name}</span>
                    ) : (
                      <button type="button" onClick={() => navigate({ dossier: step.id })} className="truncate text-ink-2 hover:text-ink">
                        {step.name}
                      </button>
                    )}
                  </span>
                ))
              )}
            </nav>

            <div className="flex flex-wrap items-center gap-2">
              {searchOpen ? (
                <form
                  className="animate-pop flex items-center"
                  onSubmit={(event) => {
                    event.preventDefault()
                    navigate({ q: search.trim() || null })
                  }}
                >
                  <Input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Nom du fichier"
                    className="h-9 w-48 text-[0.84rem]"
                    aria-label="Rechercher dans les fichiers"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('')
                      setSearchOpen(false)
                      if (query.search) navigate({ q: null })
                    }}
                    className="ml-1 grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2"
                    aria-label="Fermer la recherche"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-2 hover:bg-surface-2 hover:text-ink"
                  aria-label="Rechercher"
                >
                  <Search className="h-4 w-4" />
                </button>
              )}

              <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Affichage">
                {(['list', 'grid'] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    aria-pressed={query.view === view}
                    onClick={() => navigate({ vue: view === 'grid' ? 'grille' : null, page: String(query.page) }, true)}
                    className={cn(
                      'grid h-8 w-8 place-items-center rounded-md transition-colors',
                      query.view === view ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:text-ink',
                    )}
                    aria-label={view === 'list' ? 'Liste' : 'Grille'}
                  >
                    {view === 'list' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                  </button>
                ))}
              </div>

              <label className="flex h-9 items-center gap-1.5 rounded-lg border border-line pl-3 text-[0.8rem] text-ink-2">
                <span className="hidden sm:inline">Trier par :</span>
                <Select
                  value={query.sort}
                  onChange={(event) => navigate({ tri: event.target.value === 'updatedAt' ? null : event.target.value }, true)}
                  className="h-8 w-auto border-0 bg-transparent pr-8 pl-1 text-[0.8rem] text-ink focus:ring-0"
                  aria-label="Trier par"
                >
                  {SORTS.map((sort) => (
                    <option key={sort.value} value={sort.value}>
                      {sort.label}
                    </option>
                  ))}
                </Select>
              </label>

              <button
                type="button"
                onClick={() => navigate({ corbeille: query.trash ? null : '1', dossier: null, q: null })}
                aria-pressed={query.trash}
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-lg border transition-colors',
                  query.trash ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-surface-2 hover:text-ink',
                )}
                aria-label={query.trash ? 'Quitter la corbeille' : 'Afficher la corbeille'}
                title="Corbeille"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {checked.size > 0 && (
            <div className="animate-fade flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft px-4 py-2 text-sm">
              <span className="font-medium text-ink">
                {checked.size} sélectionné{checked.size > 1 ? 's' : ''}
              </span>
              <span className="flex-1" />
              {!query.trash && can.has('files:update') && (
                <Button size="sm" icon={<FolderInput className="h-3.5 w-3.5" />} onClick={() => setDialog({ kind: 'move', files: checkedFiles })}>
                  Déplacer
                </Button>
              )}
              {can.has('files:delete') && (
                <Button
                  size="sm"
                  variant="danger-ghost"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => setDialog({ kind: query.trash ? 'destroy' : 'trash', files: checkedFiles })}
                >
                  {query.trash ? 'Supprimer définitivement' : 'Corbeille'}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>
                Annuler
              </Button>
            </div>
          )}

          {empty ? (
            <EmptyState
              icon={query.trash ? <Trash2 /> : query.search ? <Search /> : <CloudUpload />}
              title={query.trash ? 'La corbeille est vide' : query.search ? `Aucun fichier ne correspond à « ${query.search} »` : 'Ce dossier est vide'}
              description={
                query.trash || query.search
                  ? undefined
                  : 'Déposez des fichiers ici, ou utilisez le bouton Téléverser. Audio, images, vidéos et documents sont acceptés.'
              }
              action={
                !query.trash && !query.search && can.has('files:upload') ? (
                  <Button variant="primary" icon={<CloudUpload className="h-4 w-4" />} onClick={() => picker.current?.click()}>
                    Téléverser des fichiers
                  </Button>
                ) : undefined
              }
            />
          ) : query.view === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {visibleFolders.map((folder, index) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => navigate({ dossier: folder.id })}
                  className={cn('animate-rise rounded-xl border border-line p-3 text-left transition-colors hover:border-line-strong hover:bg-surface-2', `stagger-${Math.min(index + 1, 6)}`)}
                >
                  <FileIcon category="folder" size="lg" />
                  <p className="mt-3 truncate text-sm font-medium text-ink">{folder.name}</p>
                  <p className="text-xs text-muted">{folder.files ?? 0} fichier{(folder.files ?? 0) > 1 ? 's' : ''}</p>
                </button>
              ))}
              {files.map((file, index) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => select(file)}
                  onDoubleClick={() => router.push(`/fichiers/${file.id}`)}
                  className={cn(
                    'animate-rise overflow-hidden rounded-xl border text-left transition-colors',
                    selected?.id === file.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong hover:bg-surface-2',
                    `stagger-${Math.min(index + visibleFolders.length + 1, 6)}`,
                  )}
                >
                  <div className="grid aspect-[4/3] place-items-center border-b border-line bg-surface-2">
                    {file.category === 'image' && file.status === 'active' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={streamUrl(project, file.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : file.category === 'audio' && file.waveform.length > 0 ? (
                      <div className="flex h-12 w-4/5 items-center gap-[2px]" aria-hidden="true">
                        {file.waveform.filter((_, i) => i % 3 === 0).map((value, i) => (
                          <span key={i} className="flex-1 rounded-full bg-type-audio/70" style={{ height: `${Math.max(8, value)}%` }} />
                        ))}
                      </div>
                    ) : (
                      <FileIcon category={file.category} size="lg" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                    <p className="text-xs text-muted">
                      {formatBytes(file.size)} · {CATEGORY_LABELS[file.category]}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[0.86rem] sm:min-w-[640px]">
                <thead>
                  <tr className="border-b border-line text-[0.8rem] text-ink-2">
                    <th className="w-12 py-3 pl-5">
                      <Checkbox
                        aria-label="Tout sélectionner"
                        checked={allChecked}
                        ref={(element) => {
                          if (element) element.indeterminate = checked.size > 0 && !allChecked
                        }}
                        onChange={() => setChecked(allChecked ? new Set() : new Set(files.map((file) => file.id)))}
                      />
                    </th>
                    <th className="w-[44%] py-3 pl-2 font-medium">Nom</th>
                    <th className="py-3 font-medium">Taille</th>
                    <th className="hidden py-3 font-medium sm:table-cell">Type</th>
                    <th className="hidden py-3 font-medium md:table-cell">{query.trash ? 'Supprimé le' : 'Modifié le'}</th>
                    <th className="w-14 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visibleFolders.map((folder, index) => (
                    <tr
                      key={folder.id}
                      onClick={() => navigate({ dossier: folder.id })}
                      className={cn('animate-fade cursor-pointer border-b border-line transition-colors hover:bg-surface-2', `stagger-${Math.min(index + 1, 6)}`)}
                    >
                      <td className="py-2.5 pl-5" onClick={(event) => event.stopPropagation()}>
                        <Checkbox disabled aria-label={`${folder.name} (dossier)`} />
                      </td>
                      <td className="py-2.5 pl-2">
                        <span className="flex items-center gap-3">
                          <FileIcon category="folder" />
                          <span className="truncate text-ink">{folder.name}</span>
                        </span>
                      </td>
                      <td className="py-2.5 text-ink-2">—</td>
                      <td className="hidden py-2.5 text-ink-2 sm:table-cell">Dossier</td>
                      <td className="hidden py-2.5 text-ink-2 md:table-cell">{formatDate(folder.updatedAt)}</td>
                      <td className="py-2.5 pr-3 text-right" onClick={(event) => event.stopPropagation()}>
                        <ActionMenu
                          label={`Actions sur ${folder.name}`}
                          items={[
                            { label: 'Ouvrir', icon: <ArrowRight />, onSelect: () => navigate({ dossier: folder.id }) },
                            { label: 'Gérer les dossiers', icon: <FolderInput />, onSelect: () => router.push('/dossiers') },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                  {files.map((file, index) => (
                    <tr
                      key={file.id}
                      onClick={() => select(file)}
                      onDoubleClick={() => router.push(`/fichiers/${file.id}`)}
                      aria-selected={selected?.id === file.id}
                      className={cn(
                        'animate-fade cursor-pointer border-b border-line transition-colors last:border-b-0',
                        selected?.id === file.id ? 'bg-accent-soft' : checked.has(file.id) ? 'bg-surface-2' : 'hover:bg-surface-2',
                        `stagger-${Math.min(index + visibleFolders.length + 1, 6)}`,
                      )}
                    >
                      <td className="py-2.5 pl-5" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          aria-label={`Sélectionner ${file.name}`}
                          checked={checked.has(file.id)}
                          onChange={() =>
                            setChecked((set) => {
                              const next = new Set(set)
                              if (next.has(file.id)) next.delete(file.id)
                              else next.add(file.id)
                              return next
                            })
                          }
                        />
                      </td>
                      <td className="max-w-0 py-2.5 pl-2">
                        <span className="flex items-center gap-3">
                          <FileIcon category={file.category} />
                          <span className="truncate text-ink" title={file.name}>
                            {file.name}
                          </span>
                        </span>
                      </td>
                      <td className="py-2.5 whitespace-nowrap text-ink-2 tabular-nums">{formatBytes(file.size)}</td>
                      <td className="hidden py-2.5 text-ink-2 sm:table-cell">{CATEGORY_LABELS[file.category]}</td>
                      <td className="hidden py-2.5 whitespace-nowrap text-ink-2 md:table-cell">{formatDate(query.trash && file.trashedAt ? file.trashedAt : file.updatedAt)}</td>
                      <td className="py-2.5 pr-3 text-right" onClick={(event) => event.stopPropagation()}>
                        <ActionMenu label={`Actions sur ${file.name}`} items={rowActions(file)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > limit && (
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[0.8rem] text-ink-2">
              <span className="tabular-nums">
                {from}–{to} sur {total}
              </span>
              <div className="flex gap-2">
                <Button size="sm" icon={<ArrowLeft className="h-3.5 w-3.5" />} disabled={query.page <= 1} onClick={() => navigate({ page: String(query.page - 1) }, true)}>
                  Précédent
                </Button>
                <Button size="sm" disabled={to >= total} onClick={() => navigate({ page: String(query.page + 1) }, true)}>
                  Suivant
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </section>

        {bottom}
      </div>

      {selected ? (
        <FilePanel
          key={selected.id}
          file={selected}
          project={project}
          provider={provider}
          permissions={permissions}
          onClose={() => select(null)}
          onAction={setDialog}
          onRestore={restore}
          className="max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-40 max-xl:w-[min(380px,100vw)] max-xl:rounded-none xl:sticky xl:top-[88px] xl:max-h-[calc(100vh-104px)]"
        />
      ) : (
        <aside className="hidden h-fit rounded-xl border border-dashed border-line-strong p-6 text-center xl:sticky xl:top-[88px] xl:block">
          <FileIcon category="document" size="lg" className="mx-auto" />
          <p className="mt-3 text-sm font-medium text-ink">Aucun fichier sélectionné</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Cliquez sur un fichier pour l’écouter, voir ses informations et créer un lien temporaire.
          </p>
          <Link href="/televersement" className="mt-4 inline-flex items-center gap-1.5 text-xs text-accent hover:underline">
            <CloudUpload className="h-3.5 w-3.5" />
            Ouvrir la page d’upload
          </Link>
        </aside>
      )}

      <FileDialogs dialog={dialog} project={project} onClose={() => setDialog(null)} onDone={refresh} />
      <NewFolderDialog
        open={newFolder}
        onClose={() => setNewFolder(false)}
        project={project}
        parentId={folderId}
        parentName={current?.name ?? null}
        onCreated={() => startTransition(() => router.refresh())}
      />
    </div>
  )
}

export function NewFolderDialog({
  open,
  onClose,
  project,
  parentId,
  parentName,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  project: string
  parentId: string | null
  parentName: string | null
  onCreated: (folder: FolderDto) => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  function close() {
    setName('')
    onClose()
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const data = await api<{ folder: FolderDto }>('/api/v1/folders', {
        method: 'POST',
        project,
        body: { name, parentId },
      })
      toast.success('Dossier créé', data.folder.name)
      onCreated(data.folder)
      close()
    } catch (error) {
      toast.error('Création impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="sm"
      title="Nouveau dossier"
      description={parentName ? `Dans ${parentName}` : 'À la racine du projet'}
      icon={<FolderPlus className="h-[18px] w-[18px]" />}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nom du dossier" htmlFor="folder-name">
          <Input id="folder-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="covers" maxLength={80} required data-autofocus />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={close}>Annuler</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
            Créer
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
