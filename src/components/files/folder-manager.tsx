'use client'

import { ChevronRight, FolderOpen, FolderPlus, House, PencilLine, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { FileIcon } from '@/components/files/file-icon'
import { NewFolderDialog } from '@/components/files/files-explorer'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { ActionMenu } from '@/components/ui/menu'
import { Card, EmptyState, PageHeader } from '@/components/ui/surface'
import { useToast } from '@/components/ui/toast'
import type { FolderDto } from '@/lib/api/serialize'
import { api, errorMessage } from '@/lib/client/api'
import { cn, formatDate } from '@/lib/utils'

/** Organisation des dossiers (CDS 6.2, 8) : créer, renommer, supprimer, parcourir. */
export function FolderManager({
  project,
  parentId,
  path,
  folders,
  canWrite,
}: {
  project: string
  parentId: string | null
  path: { id: string; name: string }[]
  folders: FolderDto[]
  canWrite: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<FolderDto | null>(null)
  const [deleting, setDeleting] = useState<FolderDto | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = () => startTransition(() => router.refresh())
  const here = path.at(-1)

  async function rename(event: React.FormEvent) {
    event.preventDefault()
    if (!renaming) return
    setBusy(true)
    try {
      await api(`/api/v1/folders/${renaming.id}`, { method: 'PATCH', project, body: { name } })
      toast.success('Dossier renommé', name)
      setRenaming(null)
      refresh()
    } catch (error) {
      toast.error('Renommage impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try {
      await api(`/api/v1/folders/${deleting.id}`, { method: 'DELETE', project })
      toast.success('Dossier supprimé', deleting.name)
      setDeleting(null)
      refresh()
    } catch (error) {
      toast.error('Suppression impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dossiers"
        description="Organisez les fichiers du projet. L’arborescence est reproduite chez le fournisseur de stockage."
        actions={
          canWrite && (
            <Button variant="primary" icon={<FolderPlus className="h-[18px] w-[18px]" />} onClick={() => setCreating(true)}>
              Nouveau dossier
            </Button>
          )
        }
      />

      <Card className="animate-rise stagger-1">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-3 text-sm">
          <Link href="/dossiers" className="flex items-center gap-1.5 text-ink-2 hover:text-ink">
            <House className="h-4 w-4" />
            Racine
          </Link>
          {path.map((step, index) => (
            <span key={step.id} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 text-muted" />
              {index === path.length - 1 ? (
                <span className="font-medium text-ink">{step.name}</span>
              ) : (
                <Link href={`/dossiers?parent=${step.id}`} className="text-ink-2 hover:text-ink">
                  {step.name}
                </Link>
              )}
            </span>
          ))}
          <span className="flex-1" />
          <Link
            href={parentId ? `/fichiers?dossier=${parentId}` : '/fichiers'}
            className="flex items-center gap-1.5 text-[0.8rem] text-accent hover:underline"
          >
            <FolderOpen className="h-4 w-4" />
            Voir les fichiers {here ? `de ${here.name}` : 'de la racine'}
          </Link>
        </div>

        {folders.length === 0 ? (
          <EmptyState
            icon={<FolderPlus />}
            title={here ? `Aucun sous-dossier dans ${here.name}` : 'Aucun dossier pour l’instant'}
            description="Par exemple : audio, covers, artists, albums — comme dans la structure de stockage de Karaks."
            action={
              canWrite ? (
                <Button variant="primary" icon={<FolderPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                  Créer un dossier
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {folders.map((folder, index) => (
              <li
                key={folder.id}
                className={cn(
                  'animate-rise group relative rounded-xl border border-line p-4 transition-colors hover:border-line-strong hover:bg-surface-2',
                  `stagger-${Math.min(index + 1, 6)}`,
                )}
              >
                <Link href={`/dossiers?parent=${folder.id}`} className="absolute inset-0 rounded-xl" aria-label={`Ouvrir ${folder.name}`} />
                <div className="flex items-start gap-3">
                  <FileIcon category="folder" size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{folder.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {folder.files ?? 0} fichier{(folder.files ?? 0) > 1 ? 's' : ''} · {folder.folders ?? 0} sous-dossier
                      {(folder.folders ?? 0) > 1 ? 's' : ''}
                    </p>
                  </div>
                  {canWrite && (
                    <div className="relative z-10">
                      <ActionMenu
                        label={`Actions sur ${folder.name}`}
                        items={[
                          { label: 'Ouvrir les fichiers', icon: <FolderOpen />, onSelect: () => router.push(`/fichiers?dossier=${folder.id}`) },
                          {
                            label: 'Renommer',
                            icon: <PencilLine />,
                            onSelect: () => {
                              setName(folder.name)
                              setRenaming(folder)
                            },
                          },
                          { label: 'Supprimer', icon: <Trash2 />, tone: 'danger', separatorBefore: true, onSelect: () => setDeleting(folder) },
                        ]}
                      />
                    </div>
                  )}
                </div>
                <p className="mt-4 text-[0.72rem] text-muted">Modifié le {formatDate(folder.updatedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <NewFolderDialog
        open={creating}
        onClose={() => setCreating(false)}
        project={project}
        parentId={parentId}
        parentName={here?.name ?? null}
        onCreated={refresh}
      />

      <Dialog open={renaming !== null} onClose={() => setRenaming(null)} size="sm" title="Renommer le dossier" icon={<PencilLine className="h-[18px] w-[18px]" />}>
        <form onSubmit={rename} className="space-y-4">
          <Field label="Nom" htmlFor="folder-rename">
            <Input id="folder-rename" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} data-autofocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setRenaming(null)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={busy}>
              Renommer
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        size="sm"
        title={`Supprimer ${deleting?.name ?? 'le dossier'} ?`}
        description="Seul un dossier vide peut être supprimé : déplacez ou supprimez d’abord son contenu, y compris celui de la corbeille."
        icon={<Trash2 className="h-[18px] w-[18px]" />}
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Annuler</Button>
            <Button variant="danger" loading={busy} onClick={remove}>
              Supprimer
            </Button>
          </>
        }
      />
    </div>
  )
}
