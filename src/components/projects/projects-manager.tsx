'use client'

import { ArrowRight, Check, Layers, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { selectProject } from '@/app/(app)/actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/surface'
import { useToast } from '@/components/ui/toast'
import type { ProjectDto } from '@/lib/api/serialize'
import { api, errorMessage } from '@/lib/client/api'
import { formatBytes } from '@/lib/files/types'
import { cn, formatCount, formatDate, initials } from '@/lib/utils'

export interface ProjectCard extends ProjectDto {
  files: number
  bytes: number
  keys: number
  members: number
}

const ROLES: Record<string, string> = { OWNER: 'Propriétaire', ADMIN: 'Administration', DEVELOPER: 'Développement', VIEWER: 'Lecture seule' }

/** Projets (CDS 7) : chacun a ses fichiers, ses clés, ses réglages et ses statistiques. */
export function ProjectsManager({
  projects,
  current,
  canCreate,
  openCreate,
}: {
  projects: ProjectCard[]
  current: string | null
  canCreate: boolean
  openCreate: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(openCreate && canCreate)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [origins, setOrigins] = useState('')
  const [busy, setBusy] = useState(false)

  function open(id: string) {
    startTransition(async () => {
      await selectProject(id)
      router.push('/fichiers')
      router.refresh()
    })
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const data = await api<{ project: ProjectDto }>('/api/v1/projects', {
        method: 'POST',
        body: {
          name,
          description: description || null,
          allowedOrigins: origins
            .split(/[\s,]+/)
            .map((value) => value.trim())
            .filter(Boolean),
        },
      })
      toast.success('Projet créé', data.project.name)
      setCreating(false)
      setName('')
      setDescription('')
      setOrigins('')
      open(data.project.id)
    } catch (error) {
      toast.error('Création impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projets"
        description="Un projet par application : Karaks Production, Moziik, un projet de test..."
        actions={
          canCreate && (
            <Button variant="primary" icon={<Plus className="h-[18px] w-[18px]" />} onClick={() => setCreating(true)}>
              Nouveau projet
            </Button>
          )
        }
      />

      {projects.length === 0 ? (
        <Card className="animate-rise stagger-1">
          <EmptyState
            icon={<Layers />}
            title="Aucun projet"
            description={canCreate ? 'Créez un premier projet pour commencer à téléverser.' : 'Un administrateur doit vous ajouter à un projet.'}
          />
        </Card>
      ) : (
        <div className={cn('grid gap-4 md:grid-cols-2 2xl:grid-cols-3', pending && 'opacity-70')}>
          {projects.map((project, index) => (
            <Card key={project.id} className={cn('animate-rise flex flex-col p-5', `stagger-${Math.min(index + 1, 6)}`, project.id === current && 'border-accent')}>
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface-3 font-display text-sm font-semibold text-ink">{initials(project.name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{project.name}</p>
                  <p className="font-mono text-[0.72rem] text-muted">{project.id}</p>
                </div>
                {project.id === current ? (
                  <Badge tone="accent" icon={<Check />}>
                    Actuel
                  </Badge>
                ) : (
                  project.role && <Badge>{ROLES[project.role] ?? project.role}</Badge>
                )}
              </div>
              {project.description && <p className="mt-3 line-clamp-2 text-sm text-ink-2">{project.description}</p>}
              <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-4 text-center">
                {[
                  { label: 'Fichiers', value: formatCount(project.files) },
                  { label: 'Stockage', value: formatBytes(project.bytes) },
                  { label: 'Clés', value: formatCount(project.keys) },
                  { label: 'Membres', value: formatCount(project.members) },
                ].map((item) => (
                  <div key={item.label}>
                    <dd className="text-sm font-semibold text-ink tabular-nums">{item.value}</dd>
                    <dt className="text-[0.7rem] text-muted">{item.label}</dt>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted">Créé le {formatDate(project.createdAt)}</span>
                <Button size="sm" variant={project.id === current ? 'secondary' : 'primary'} onClick={() => open(project.id)}>
                  Ouvrir
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nouveau projet" description="Le projet reçoit son dossier chez le fournisseur de stockage." icon={<Layers className="h-[18px] w-[18px]" />}>
        <form onSubmit={create} className="space-y-4">
          <Field label="Nom" htmlFor="project-name">
            <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Karaks Production" required minLength={2} maxLength={60} data-autofocus />
          </Field>
          <Field label="Description" htmlFor="project-description">
            <Textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={240} />
          </Field>
          <Field
            label="Origines autorisées"
            htmlFor="project-origins"
            hint="Sites qui lisent les liens temporaires depuis un script (vumètre, mode hors connexion). Une par ligne, par exemple https://karaks.com."
          >
            <Textarea id="project-origins" value={origins} onChange={(event) => setOrigins(event.target.value)} placeholder="https://karaks.com" className="min-h-16 font-mono text-[0.8rem]" />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button onClick={() => setCreating(false)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={name.trim().length < 2}>
              Créer le projet
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
