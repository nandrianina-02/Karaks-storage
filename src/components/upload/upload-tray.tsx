'use client'

import { ChevronDown, CircleAlert, CircleCheck, CloudUpload, Pause, Play, RotateCcw, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { FileIcon } from '@/components/files/file-icon'
import { IconButton } from '@/components/ui/button'
import { useUploads, type UploadItem } from '@/components/upload/upload-manager'
import { categoryOf, extensionOf, FILE_TYPES, formatBytes } from '@/lib/files/types'
import { cn } from '@/lib/utils'

/** Panneau flottant des envois en cours, visible depuis toutes les pages. */
export function UploadTray() {
  const { items, clearFinished } = useUploads()
  const [collapsed, setCollapsed] = useState(false)
  if (items.length === 0) return null

  const active = items.filter((item) => ['queued', 'preparing', 'uploading'].includes(item.status))
  const total = items.reduce((sum, item) => sum + item.size, 0)
  const received = items.reduce((sum, item) => sum + (item.status === 'canceled' ? item.size : item.received), 0)
  const percent = total ? Math.round((received / total) * 100) : 0

  return (
    <aside
      className="animate-rise fixed right-4 bottom-4 z-40 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line-strong bg-surface shadow-panel"
      aria-label="Téléversements"
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <CloudUpload className="h-[18px] w-[18px] text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            {active.length > 0 ? `Envoi de ${active.length} fichier${active.length > 1 ? 's' : ''}` : 'Envois terminés'}
          </p>
          <p className="text-xs text-muted tabular-nums">
            {formatBytes(received)} sur {formatBytes(total)} · {percent} %
          </p>
        </div>
        {active.length === 0 && (
          <button type="button" onClick={clearFinished} className="text-xs text-ink-2 hover:text-ink">
            Effacer
          </button>
        )}
        <IconButton label={collapsed ? 'Déplier' : 'Replier'} onClick={() => setCollapsed((value) => !value)}>
          <ChevronDown className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        </IconButton>
      </header>
      {!collapsed && (
        <ul className="max-h-72 overflow-y-auto">
          {items.map((item) => (
            <UploadRow key={item.key} item={item} />
          ))}
        </ul>
      )}
    </aside>
  )
}

function remaining(item: UploadItem) {
  if (!item.rate || item.status !== 'uploading') return null
  const seconds = (item.size - item.received) / item.rate
  if (!Number.isFinite(seconds)) return null
  return seconds < 60 ? `${Math.max(1, Math.round(seconds))} s restantes` : `${Math.round(seconds / 60)} min restantes`
}

const STATUS_LABELS: Record<UploadItem['status'], string> = {
  queued: 'En attente',
  preparing: 'Analyse du fichier',
  uploading: 'Envoi',
  paused: 'En pause',
  error: 'Interrompu',
  done: 'Terminé',
  canceled: 'Annulé',
}

export function UploadRow({ item, detailed = false }: { item: UploadItem; detailed?: boolean }) {
  const { pause, resume, cancel } = useUploads()
  const rule = FILE_TYPES[extensionOf(item.name)]
  const category = rule ? rule.category : categoryOf('')
  const percent = item.size ? Math.round((item.received / item.size) * 100) : 0
  const busy = ['queued', 'preparing', 'uploading'].includes(item.status)

  return (
    <li className="animate-fade flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <FileIcon category={category} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          {item.fileId ? (
            <Link href={`/fichiers/${item.fileId}`} className="truncate text-[0.84rem] text-ink hover:underline">
              {item.name}
            </Link>
          ) : (
            <p className="truncate text-[0.84rem] text-ink">{item.name}</p>
          )}
          <span className="shrink-0 text-[0.72rem] text-muted tabular-nums">{formatBytes(item.size)}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-accent-soft">
          {item.status === 'preparing' ? (
            <div className="progress-indeterminate h-full w-1/3 rounded-full bg-accent" />
          ) : (
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-300',
                item.status === 'error' ? 'bg-danger' : item.status === 'done' ? 'bg-success' : 'bg-accent',
              )}
              style={{ width: `${item.status === 'canceled' ? 0 : percent}%` }}
            />
          )}
        </div>
        <p className={cn('mt-1 truncate text-[0.72rem]', item.status === 'error' ? 'text-danger' : 'text-muted')}>
          {item.error ?? [STATUS_LABELS[item.status], item.status === 'uploading' ? `${percent} %` : null, remaining(item), detailed && item.folderName ? `dans ${item.folderName}` : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        {item.status === 'done' && <CircleCheck className="h-[18px] w-[18px] text-success" aria-label="Terminé" />}
        {item.status === 'error' && <CircleAlert className="mr-1 h-[18px] w-[18px] text-danger" aria-hidden="true" />}
        {item.status === 'uploading' && (
          <IconButton label="Mettre en pause" onClick={() => pause(item.key)}>
            <Pause className="h-4 w-4" />
          </IconButton>
        )}
        {item.status === 'paused' && (
          <IconButton label="Reprendre" onClick={() => resume(item.key)}>
            <Play className="h-4 w-4" />
          </IconButton>
        )}
        {item.status === 'error' && (
          <IconButton label="Reprendre l’envoi" onClick={() => resume(item.key)}>
            <RotateCcw className="h-4 w-4" />
          </IconButton>
        )}
        {(busy || item.status === 'paused' || item.status === 'error') && (
          <IconButton label="Annuler" onClick={() => cancel(item.key)}>
            <X className="h-4 w-4" />
          </IconButton>
        )}
      </div>
    </li>
  )
}
