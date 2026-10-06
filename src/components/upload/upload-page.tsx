'use client'

import { CloudUpload, FileAudio, FileImage, FileText, FileVideo, FolderClosed, Pause, RotateCcw, ShieldCheck } from 'lucide-react'
import { useRef, useState } from 'react'

import { FolderBrowser } from '@/components/files/file-dialogs'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, PageHeader } from '@/components/ui/surface'
import { UploadRow } from '@/components/upload/upload-tray'
import { useUploads } from '@/components/upload/upload-manager'
import { ACCEPT_ATTRIBUTE, formatBytes } from '@/lib/files/types'
import { cn } from '@/lib/utils'

const FORMATS = [
  { icon: FileAudio, label: 'Audio', list: 'MP3, WAV, OGG, FLAC, AAC, M4A' },
  { icon: FileImage, label: 'Images', list: 'JPEG, PNG, WebP, GIF' },
  { icon: FileVideo, label: 'Vidéo', list: 'MP4, WebM' },
  { icon: FileText, label: 'Documents', list: 'PDF, TXT' },
]

/** Page Upload (CDS 6.2, 12) : dépôt multiple, destination, suivi des envois. */
export function UploadPage({ project, maxFileSize }: { project: string; maxFileSize: number }) {
  const uploads = useUploads()
  const picker = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [target, setTarget] = useState<{ id: string | null; name: string }>({ id: null, name: 'Racine du projet' })

  function add(list: FileList | null) {
    if (!list || list.length === 0) return
    uploads.add([...list], { project, folderId: target.id, folderName: target.name })
  }

  const mine = uploads.items.filter((item) => item.project === project)

  return (
    <div className="space-y-6">
      <PageHeader title="Upload" description="Téléversez plusieurs fichiers à la fois. Un envoi interrompu reprend là où il s’est arrêté." />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <label
            className={cn(
              'animate-rise stagger-1 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors',
              dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:border-ink-2/50',
            )}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              add(event.dataTransfer.files)
            }}
          >
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
              <CloudUpload className="h-7 w-7" />
            </span>
            <span className="mt-5 text-base font-medium text-ink">Glissez vos fichiers ici</span>
            <span className="mt-1 text-sm text-ink-2">
              ou <span className="font-medium text-accent">parcourez votre appareil</span> — jusqu’à {formatBytes(maxFileSize)} par fichier
            </span>
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-ink-2">
              <FolderClosed className="h-3.5 w-3.5" />
              Destination : {target.name}
            </span>
            <input
              ref={picker}
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              className="sr-only"
              onChange={(event) => {
                add(event.target.files)
                event.target.value = ''
              }}
            />
          </label>

          <Card className="animate-rise stagger-2">
            <CardHeader
              title="Envois"
              description={mine.length ? `${mine.length} fichier${mine.length > 1 ? 's' : ''} dans cette session` : 'Aucun envoi en cours'}
              actions={
                mine.some((item) => ['done', 'canceled'].includes(item.status)) ? (
                  <Button size="sm" variant="ghost" onClick={uploads.clearFinished}>
                    Effacer les envois terminés
                  </Button>
                ) : undefined
              }
            />
            {mine.length === 0 ? (
              <p className="px-5 pb-6 text-sm text-ink-2">Les fichiers déposés apparaissent ici avec leur progression.</p>
            ) : (
              <ul className="border-t border-line">
                {mine.map((item) => (
                  <UploadRow key={item.key} item={item} detailed />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="animate-rise stagger-2">
            <CardHeader title="Dossier de destination" description="Les fichiers déposés y seront rangés." />
            <div className="px-5 pb-5">
              <FolderBrowser project={project} value={target.id} onChange={setTarget} />
            </div>
          </Card>

          <Card className="animate-rise stagger-3">
            <CardHeader title="Formats acceptés" />
            <ul className="space-y-3 px-5 pb-5">
              {FORMATS.map((format) => (
                <li key={format.label} className="flex items-center gap-3">
                  <format.icon className="h-[18px] w-[18px] text-ink-2" />
                  <span className="w-24 text-sm text-ink">{format.label}</span>
                  <span className="text-xs text-muted">{format.list}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-2.5 border-t border-line px-5 py-4 text-xs leading-relaxed text-ink-2">
              <p className="flex gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
                Le contenu réel de chaque fichier est vérifié : un fichier renommé en .mp3 sans en être un est refusé.
              </p>
              <p className="flex gap-2">
                <Pause className="h-4 w-4 shrink-0 text-ink-2" />
                Les envois se mettent en pause et reprennent sans recommencer.
              </p>
              <p className="flex gap-2">
                <RotateCcw className="h-4 w-4 shrink-0 text-ink-2" />
                Après une coupure réseau, l’envoi repart seul depuis le dernier morceau reçu.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
