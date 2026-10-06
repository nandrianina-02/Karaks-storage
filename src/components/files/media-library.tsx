'use client'

import { CirclePlay, Download, Link2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { FileDialogs, type FileDialog } from '@/components/files/file-dialogs'
import { FileIcon } from '@/components/files/file-icon'
import { WaveformPlayer } from '@/components/files/waveform-player'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/surface'
import type { FileDto } from '@/lib/api/serialize'
import { downloadUrl, streamUrl } from '@/lib/client/api'
import { formatBytes } from '@/lib/files/types'
import { cn, formatCount, formatDuration } from '@/lib/utils'

/** Médiathèque : écouter et voir les médias du projet, sans quitter la page. */
export function MediaLibrary({
  project,
  files,
  canLink,
  canDownload,
}: {
  project: string
  files: FileDto[]
  canLink: boolean
  canDownload: boolean
}) {
  const [current, setCurrent] = useState<FileDto | null>(files[0] ?? null)
  const [dialog, setDialog] = useState<FileDialog>(null)

  if (files.length === 0) {
    return (
      <Card className="animate-rise stagger-1">
        <EmptyState
          icon={<CirclePlay />}
          title="Aucun média dans ce projet"
          description="Les fichiers audio et vidéo téléversés apparaîtront ici, prêts à être écoutés."
        />
      </Card>
    )
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Card className="animate-rise stagger-1 h-fit xl:sticky xl:top-[88px]">
        {current && (
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <FileIcon category={current.category} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold text-ink">{current.name}</h2>
                <p className="text-xs text-muted">
                  {formatBytes(current.size)} · {formatDuration(current.durationSeconds)} · {formatCount(current.streams)} lecture
                  {current.streams > 1 ? 's' : ''}
                </p>
              </div>
            </div>
            {current.category === 'video' ? (
              <video key={current.id} src={streamUrl(project, current.id)} controls preload="metadata" className="w-full rounded-xl border border-line bg-black" />
            ) : (
              <WaveformPlayer key={current.id} src={streamUrl(project, current.id)} waveform={current.waveform} duration={current.durationSeconds} />
            )}
            <div className="flex flex-wrap gap-2">
              {canLink && (
                <Button icon={<Link2 className="h-4 w-4" />} onClick={() => setDialog({ kind: 'link', file: current })}>
                  Lien temporaire
                </Button>
              )}
              {canDownload && (
                <a href={downloadUrl(project, current.id)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-3.5 text-sm text-ink hover:bg-surface-2">
                  <Download className="h-4 w-4" />
                  Télécharger
                </a>
              )}
              <Link href={`/fichiers/${current.id}`} className="inline-flex h-10 items-center px-2 text-sm text-accent hover:underline">
                Fiche du fichier
              </Link>
            </div>
          </div>
        )}
      </Card>

      <Card className="animate-rise stagger-2">
        <CardHeader title="Médias" description={`${files.length} fichier${files.length > 1 ? 's' : ''} audio et vidéo`} />
        <ul className="px-2 pb-2">
          {files.map((file, index) => (
            <li key={file.id} className={cn('animate-fade', `stagger-${Math.min(index + 1, 6)}`)}>
              <button
                type="button"
                onClick={() => setCurrent(file)}
                aria-current={current?.id === file.id}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                  current?.id === file.id ? 'bg-accent-soft' : 'hover:bg-surface-2',
                )}
              >
                <FileIcon category={file.category} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.88rem] text-ink">{file.name}</span>
                  <span className="block text-xs text-muted">
                    {formatDuration(file.durationSeconds)} · {formatBytes(file.size)}
                  </span>
                </span>
                {file.waveform.length > 0 && (
                  <span className="hidden h-7 w-28 items-center gap-px sm:flex" aria-hidden="true">
                    {file.waveform.filter((_, i) => i % 4 === 0).map((value, i) => (
                      <span key={i} className={cn('flex-1 rounded-full', current?.id === file.id ? 'bg-accent' : 'bg-ink-2/35')} style={{ height: `${Math.max(10, value)}%` }} />
                    ))}
                  </span>
                )}
                <span className="w-16 text-right text-xs text-ink-2 tabular-nums">{formatCount(file.streams)} lect.</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <FileDialogs dialog={dialog} project={project} onClose={() => setDialog(null)} onDone={() => undefined} />
    </div>
  )
}
