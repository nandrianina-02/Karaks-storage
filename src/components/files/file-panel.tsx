'use client'

import { Download, ExternalLink, FolderInput, Link2, MoreHorizontal, PencilLine, RotateCcw, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { CATEGORY_LABELS, FileIcon } from '@/components/files/file-icon'
import { WaveformPlayer } from '@/components/files/waveform-player'
import { IconButton } from '@/components/ui/button'
import { ActionMenu } from '@/components/ui/menu'
import type { FileDto } from '@/lib/api/serialize'
import { downloadUrl, streamUrl } from '@/lib/client/api'
import { formatBytes } from '@/lib/files/types'
import type { Permission } from '@/lib/security/permissions'
import { cn, formatDate, formatDuration } from '@/lib/utils'

import type { FileDialog } from './file-dialogs'

export interface ProviderInfo {
  kind: 'GOOGLE_DRIVE' | 'LOCAL'
  label: string
}

/**
 * Panneau de détail d'un fichier (maquette, colonne de droite) : aperçu ou
 * lecteur, informations, stockage, liens et actions.
 */
export function FilePanel({
  file,
  project,
  provider,
  permissions,
  onClose,
  onAction,
  onRestore,
  className,
}: {
  file: FileDto
  project: string
  provider: ProviderInfo
  permissions: Permission[]
  onClose?: () => void
  onAction: (dialog: FileDialog) => void
  onRestore?: (file: FileDto) => void
  className?: string
}) {
  const router = useRouter()
  const can = new Set(permissions)
  const trashed = file.status === 'trashed'

  return (
    <aside className={cn('animate-slide flex flex-col rounded-xl border border-line bg-surface', className)} aria-label={`Détail de ${file.name}`}>
      <header className="flex items-center gap-3 px-4 pt-4 pb-3">
        <FileIcon category={file.category} />
        <h2 className="min-w-0 flex-1 truncate text-[1.05rem] font-medium text-ink" title={file.name}>
          {file.name}
        </h2>
        <ActionMenu
          label="Plus d’actions"
          trigger={<MoreHorizontal className="h-[18px] w-[18px]" />}
          className="grid h-8 w-8 place-items-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
          items={[
            { label: 'Ouvrir la fiche', icon: <ExternalLink />, onSelect: () => router.push(`/fichiers/${file.id}`) },
            { label: 'Copier l’identifiant', icon: <Link2 />, onSelect: () => void navigator.clipboard.writeText(file.id) },
          ]}
        />
        {onClose && (
          <IconButton label="Fermer le panneau" onClick={onClose}>
            <X className="h-[18px] w-[18px]" />
          </IconButton>
        )}
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
        <Preview file={file} project={project} />

        <section>
          <h3 className="mb-3 text-[0.92rem] font-semibold text-ink">Informations du fichier</h3>
          <dl className="grid grid-cols-[6.5rem_1fr] gap-y-2.5 text-[0.84rem]">
            <dt className="text-muted">Nom</dt>
            <dd className="truncate text-ink" title={file.name}>
              {file.name}
            </dd>
            <dt className="text-muted">Type</dt>
            <dd className="text-ink">{file.mimeType}</dd>
            <dt className="text-muted">Taille</dt>
            <dd className="text-ink tabular-nums">{formatBytes(file.size)}</dd>
            {file.durationSeconds !== null && (
              <>
                <dt className="text-muted">Durée</dt>
                <dd className="text-ink tabular-nums">{formatDuration(file.durationSeconds)}</dd>
              </>
            )}
            {file.width !== null && file.height !== null && (
              <>
                <dt className="text-muted">Dimensions</dt>
                <dd className="text-ink tabular-nums">
                  {file.width} × {file.height}
                </dd>
              </>
            )}
            <dt className="text-muted">Créé le</dt>
            <dd className="text-ink">{formatDate(file.createdAt)}</dd>
            <dt className="text-muted">Modifié le</dt>
            <dd className="text-ink">{formatDate(file.updatedAt)}</dd>
            <dt className="text-muted">Identifiant</dt>
            <dd className="truncate font-mono text-[0.78rem] text-ink-2">{file.id}</dd>
          </dl>
        </section>

        <section className="border-t border-line pt-4">
          <h3 className="mb-3 text-[0.92rem] font-semibold text-ink">Stockage</h3>
          <div className="flex items-center gap-3">
            <ProviderMark kind={provider.kind} />
            <span className="flex-1 text-[0.86rem] text-ink">{provider.label}</span>
            <span className="text-[0.8rem] font-medium text-success">Privé</span>
          </div>
        </section>

        <section className="border-t border-line pt-4">
          <h3 className="mb-3 text-[0.92rem] font-semibold text-ink">Liens et actions</h3>
          {trashed ? (
            <div className="grid gap-2.5">
              {can.has('files:delete') && onRestore && (
                <PanelButton icon={<RotateCcw />} onClick={() => onRestore(file)}>
                  Restaurer
                </PanelButton>
              )}
              {can.has('files:delete') && (
                <PanelButton icon={<Trash2 />} tone="danger" onClick={() => onAction({ kind: 'destroy', files: [file] })}>
                  Supprimer définitivement
                </PanelButton>
              )}
            </div>
          ) : (
            <div className="grid gap-2.5">
              {can.has('links:create') && (
                <PanelButton icon={<Link2 />} onClick={() => onAction({ kind: 'link', file })}>
                  Générer un lien temporaire
                </PanelButton>
              )}
              {can.has('download:read') && (
                <a
                  href={downloadUrl(project, file.id)}
                  className="flex h-11 items-center gap-3 rounded-lg border border-line-strong px-4 text-[0.88rem] text-ink transition-colors hover:bg-surface-2"
                >
                  <Download className="h-[18px] w-[18px] text-ink-2" />
                  Télécharger
                </a>
              )}
              <div className="grid grid-cols-3 gap-2">
                {can.has('files:update') && (
                  <SmallAction icon={<FolderInput />} onClick={() => onAction({ kind: 'move', files: [file] })}>
                    Déplacer
                  </SmallAction>
                )}
                {can.has('files:update') && (
                  <SmallAction icon={<PencilLine />} onClick={() => onAction({ kind: 'rename', file })}>
                    Renommer
                  </SmallAction>
                )}
                {can.has('files:delete') && (
                  <SmallAction icon={<Trash2 />} tone="danger" onClick={() => onAction({ kind: 'trash', files: [file] })}>
                    Supprimer
                  </SmallAction>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </aside>
  )
}

function Preview({ file, project }: { file: FileDto; project: string }) {
  if (file.status === 'trashed') {
    return (
      <div className="grid h-40 place-items-center rounded-xl border border-dashed border-line-strong bg-surface-2 text-center">
        <div>
          <FileIcon category={file.category} size="lg" className="mx-auto" />
          <p className="mt-2 text-xs text-muted">À la corbeille : aperçu indisponible</p>
        </div>
      </div>
    )
  }
  const src = streamUrl(project, file.id)
  if (file.category === 'audio') {
    return <WaveformPlayer key={file.id} src={src} waveform={file.waveform} duration={file.durationSeconds} />
  }
  if (file.category === 'image') {
    return (
      <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
        {/* L'aperçu passe par l'API authentifiée : next/image n'apporterait rien ici. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={file.name} className="mx-auto max-h-64 w-auto object-contain" loading="lazy" />
      </div>
    )
  }
  if (file.category === 'video') {
    return (
      <video key={file.id} src={src} controls preload="metadata" className="w-full rounded-xl border border-line bg-black" />
    )
  }
  return (
    <div className="grid h-36 place-items-center rounded-xl border border-line bg-surface-2">
      <div className="text-center">
        <FileIcon category={file.category} size="lg" className="mx-auto" />
        <p className="mt-2 text-xs text-muted">
          {CATEGORY_LABELS[file.category]} · .{file.extension}
        </p>
        <Link href={src} target="_blank" className="mt-2 inline-block text-xs text-accent hover:underline">
          Ouvrir dans un onglet
        </Link>
      </div>
    </div>
  )
}

/** Marque du fournisseur : le triangle Drive est dessiné ici, sans logo importé. */
export function ProviderMark({ kind }: { kind: 'GOOGLE_DRIVE' | 'LOCAL' }) {
  if (kind === 'GOOGLE_DRIVE') {
    return (
      <svg viewBox="0 0 87.3 78" className="h-7 w-7 shrink-0" aria-hidden="true">
        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
        <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z" fill="#00ac47" />
        <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" fill="#ea4335" />
        <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
        <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
        <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
      </svg>
    )
  }
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-3 text-[0.62rem] font-semibold text-ink-2">
      DSK
    </span>
  )
}

function PanelButton({
  icon,
  children,
  onClick,
  tone = 'default',
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-11 items-center gap-3 rounded-lg border px-4 text-[0.88rem] transition-colors [&>svg]:h-[18px] [&>svg]:w-[18px]',
        tone === 'danger'
          ? 'border-danger/40 text-danger hover:bg-danger-soft'
          : 'border-line-strong text-ink hover:bg-surface-2 [&>svg]:text-ink-2',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function SmallAction({
  icon,
  children,
  onClick,
  tone = 'default',
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-10 items-center justify-center gap-1.5 rounded-lg border px-2 text-[0.8rem] transition-colors [&>svg]:h-4 [&>svg]:w-4',
        tone === 'danger' ? 'border-danger/40 text-danger hover:bg-danger-soft' : 'border-line-strong text-ink hover:bg-surface-2',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
