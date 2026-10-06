'use client'

import { Check, ChevronRight, Copy, FolderInput, House, Link2, PencilLine, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { FileIcon } from '@/components/files/file-icon'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import type { FileDto, FolderDto } from '@/lib/api/serialize'
import { api, errorMessage } from '@/lib/client/api'
import { cn, formatDate } from '@/lib/utils'

export type FileDialog =
  | { kind: 'link'; file: FileDto }
  | { kind: 'rename'; file: FileDto }
  | { kind: 'move'; files: FileDto[] }
  | { kind: 'trash'; files: FileDto[] }
  | { kind: 'destroy'; files: FileDto[] }
  | null

export function FileDialogs({
  dialog,
  project,
  onClose,
  onDone,
}: {
  dialog: FileDialog
  project: string
  onClose: () => void
  onDone: (change: { removed?: string[]; updated?: FileDto[] }) => void
}) {
  if (!dialog) return null
  if (dialog.kind === 'link') return <LinkDialog file={dialog.file} project={project} onClose={onClose} />
  if (dialog.kind === 'rename') return <RenameDialog file={dialog.file} project={project} onClose={onClose} onDone={onDone} />
  if (dialog.kind === 'move') return <MoveDialog files={dialog.files} project={project} onClose={onClose} onDone={onDone} />
  return <DeleteDialog files={dialog.files} permanent={dialog.kind === 'destroy'} project={project} onClose={onClose} onDone={onDone} />
}

const DURATIONS = [
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 3600, label: '1 heure' },
  { value: 86_400, label: '24 heures' },
  { value: 604_800, label: '7 jours' },
]

/** Lien temporaire (CDS 15) : l'adresse n'est affichée qu'ici, une fois. */
function LinkDialog({ file, project, onClose }: { file: FileDto; project: string; onClose: () => void }) {
  const toast = useToast()
  const [type, setType] = useState<'stream' | 'download'>('stream')
  const [expiresIn, setExpiresIn] = useState(600)
  const [maxUses, setMaxUses] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function create() {
    setBusy(true)
    try {
      const data = await api<{ url: string; expiresAt: string }>(`/api/v1/files/${file.id}/signed-url`, {
        method: 'POST',
        project,
        body: { type, expiresIn, maxUses: maxUses ? Number(maxUses) : null },
      })
      setResult(data)
    } catch (error) {
      toast.error('Lien non créé', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!result) return
    await navigator.clipboard.writeText(result.url)
    setCopied(true)
    toast.success('Lien copié')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Générer un lien temporaire"
      description={`Pour ${file.name}. Le lien expire de lui-même et peut être révoqué à tout moment.`}
      icon={<Link2 className="h-[18px] w-[18px]" />}
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>
            Terminé
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Annuler</Button>
            <Button variant="primary" loading={busy} onClick={create}>
              Générer le lien
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="animate-fade space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface-2 p-1.5 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-[0.8rem] text-ink">{result.url}</code>
            <Button size="sm" variant="primary" icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} onClick={copy}>
              {copied ? 'Copié' : 'Copier'}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-ink-2">
            Valable jusqu’au {formatDate(result.expiresAt)}. Copiez-le maintenant : il ne sera plus affiché, seule son empreinte est conservée.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Usage" htmlFor="link-type" className="sm:col-span-2">
            <div className="grid grid-cols-2 gap-2" id="link-type" role="radiogroup">
              {(['stream', 'download'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={type === value}
                  onClick={() => setType(value)}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                    type === value ? 'border-accent bg-accent-soft text-ink' : 'border-line-strong text-ink-2 hover:text-ink',
                  )}
                >
                  <span className="block font-medium">{value === 'stream' ? 'Lecture' : 'Téléchargement'}</span>
                  <span className="text-xs text-muted">{value === 'stream' ? 'Lecteur audio ou vidéo' : 'Enregistrer le fichier'}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Durée de validité" htmlFor="link-ttl">
            <Select id="link-ttl" value={expiresIn} onChange={(event) => setExpiresIn(Number(event.target.value))}>
              {DURATIONS.map((duration) => (
                <option key={duration.value} value={duration.value}>
                  {duration.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Utilisations maximales" htmlFor="link-uses" hint="Vide : illimité pendant la validité.">
            <Input
              id="link-uses"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="Illimité"
              value={maxUses}
              onChange={(event) => setMaxUses(event.target.value)}
            />
          </Field>
        </div>
      )}
    </Dialog>
  )
}

function RenameDialog({
  file,
  project,
  onClose,
  onDone,
}: {
  file: FileDto
  project: string
  onClose: () => void
  onDone: (change: { updated: FileDto[] }) => void
}) {
  const toast = useToast()
  const stem = file.name.replace(new RegExp(`\\.${file.extension}$`, 'i'), '')
  const [name, setName] = useState(stem)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const data = await api<{ file: FileDto }>(`/api/v1/files/${file.id}`, {
        method: 'PATCH',
        project,
        body: { name: `${name.trim()}.${file.extension}` },
      })
      toast.success('Fichier renommé', data.file.name)
      onDone({ updated: [data.file] })
      onClose()
    } catch (error) {
      toast.error('Renommage impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title="Renommer le fichier" icon={<PencilLine className="h-[18px] w-[18px]" />} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nom" htmlFor="rename" hint={`L’extension .${file.extension} est conservée : elle fixe le type du fichier.`}>
          <div className="flex items-center gap-2">
            <Input id="rename" value={name} onChange={(event) => setName(event.target.value)} required maxLength={240} data-autofocus />
            <span className="text-sm text-muted">.{file.extension}</span>
          </div>
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
            Renommer
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Choix d'un dossier de destination, niveau par niveau. */
export function FolderBrowser({
  project,
  value,
  onChange,
}: {
  project: string
  /** Dossier retenu : `null` pour la racine, `undefined` tant que rien n'est choisi. */
  value: string | null | undefined
  onChange: (folder: { id: string | null; name: string }) => void
}) {
  const [parent, setParent] = useState<string | null>(null)
  const [path, setPath] = useState<{ id: string; name: string }[]>([])
  const [folders, setFolders] = useState<FolderDto[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void api<{ folders: FolderDto[]; path: { id: string; name: string }[] }>(
      `/api/v1/folders${parent ? `?parentId=${parent}` : ''}`,
      { project },
    )
      .then((data) => {
        if (cancelled) return
        setFolders(data.folders)
        setPath(data.path)
      })
      .catch(() => !cancelled && setFolders([]))
    return () => {
      cancelled = true
    }
  }, [parent, project])

  return (
    <div className="overflow-hidden rounded-lg border border-line-strong">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-surface-2 px-3 py-2 text-[0.8rem]">
        <button type="button" onClick={() => setParent(null)} className="flex items-center gap-1 text-ink-2 hover:text-ink">
          <House className="h-3.5 w-3.5" />
          Racine
        </button>
        {path.map((step) => (
          <span key={step.id} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted" />
            <button type="button" onClick={() => setParent(step.id)} className="text-ink-2 hover:text-ink">
              {step.name}
            </button>
          </span>
        ))}
      </div>
      <ul className="max-h-60 overflow-y-auto p-1.5">
        <li>
          <button
            type="button"
            onClick={() => onChange({ id: parent, name: path.at(-1)?.name ?? 'Racine du projet' })}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm',
              value === parent ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-surface-2',
            )}
          >
            <Check className={cn('h-4 w-4 text-accent', value !== parent && 'invisible')} />
            Ici : {path.at(-1)?.name ?? 'racine du projet'}
          </button>
        </li>
        {folders === null && <li className="px-3 py-4 text-sm text-muted">Chargement...</li>}
        {folders?.map((folder) => (
          <li key={folder.id}>
            <button
              type="button"
              onClick={() => setParent(folder.id)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-surface-2"
            >
              <FileIcon category="folder" size="sm" />
              <span className="flex-1 truncate">{folder.name}</span>
              <ChevronRight className="h-4 w-4 text-muted" />
            </button>
          </li>
        ))}
        {folders?.length === 0 && <li className="px-3 py-3 text-xs text-muted">Aucun sous-dossier.</li>}
      </ul>
    </div>
  )
}

function MoveDialog({
  files,
  project,
  onClose,
  onDone,
}: {
  files: FileDto[]
  project: string
  onClose: () => void
  onDone: (change: { updated: FileDto[] }) => void
}) {
  const toast = useToast()
  const [target, setTarget] = useState<{ id: string | null; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function move() {
    if (!target) return
    setBusy(true)
    const updated: FileDto[] = []
    try {
      for (const file of files) {
        const data = await api<{ file: FileDto }>(`/api/v1/files/${file.id}`, {
          method: 'PATCH',
          project,
          body: { folderId: target.id },
        })
        updated.push(data.file)
      }
      toast.success(files.length > 1 ? `${files.length} fichiers déplacés` : 'Fichier déplacé', `Vers ${target.name}`)
      onDone({ updated })
      onClose()
    } catch (error) {
      toast.error('Déplacement interrompu', errorMessage(error))
      if (updated.length) onDone({ updated })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={files.length > 1 ? `Déplacer ${files.length} fichiers` : 'Déplacer le fichier'}
      description={files.length === 1 ? files[0].name : undefined}
      icon={<FolderInput className="h-[18px] w-[18px]" />}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" loading={busy} disabled={!target} onClick={move}>
            {target ? `Déplacer vers ${target.name}` : 'Choisissez un dossier'}
          </Button>
        </>
      }
    >
      <FolderBrowser project={project} value={target === null ? undefined : target.id} onChange={setTarget} />
    </Dialog>
  )
}

function DeleteDialog({
  files,
  permanent,
  project,
  onClose,
  onDone,
}: {
  files: FileDto[]
  permanent: boolean
  project: string
  onClose: () => void
  onDone: (change: { removed: string[] }) => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const many = files.length > 1

  async function confirm() {
    setBusy(true)
    const removed: string[] = []
    try {
      for (const file of files) {
        await api(`/api/v1/files/${file.id}${permanent ? '/permanent' : ''}`, { method: 'DELETE', project })
        removed.push(file.id)
      }
      toast.success(
        permanent
          ? many
            ? `${files.length} fichiers supprimés définitivement`
            : 'Fichier supprimé définitivement'
          : many
            ? `${files.length} fichiers mis à la corbeille`
            : 'Fichier mis à la corbeille',
        permanent ? undefined : 'Vous pouvez le restaurer depuis la corbeille.',
      )
      onDone({ removed })
      onClose()
    } catch (error) {
      toast.error('Suppression interrompue', errorMessage(error))
      if (removed.length) onDone({ removed })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={permanent ? 'Supprimer définitivement ?' : many ? `Mettre ${files.length} fichiers à la corbeille ?` : 'Mettre à la corbeille ?'}
      description={
        permanent
          ? 'Le fichier est effacé du stockage et ses liens temporaires cessent de fonctionner. Cette action est irréversible.'
          : 'Les fichiers à la corbeille ne sont plus diffusés, mais restent restaurables.'
      }
      icon={<Trash2 className="h-[18px] w-[18px]" />}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="danger" loading={busy} onClick={confirm} data-autofocus>
            {permanent ? 'Supprimer définitivement' : 'Mettre à la corbeille'}
          </Button>
        </>
      }
    >
      <ul className="space-y-1.5">
        {files.slice(0, 5).map((file) => (
          <li key={file.id} className="flex items-center gap-2.5 text-sm text-ink">
            <FileIcon category={file.category} size="sm" />
            <span className="truncate">{file.name}</span>
          </li>
        ))}
        {files.length > 5 && <li className="text-xs text-muted">et {files.length - 5} autres</li>}
      </ul>
    </Dialog>
  )
}
