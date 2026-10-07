'use client'

import { ArrowRightLeft, CircleStop, Cloud, Plus, Star, Trash2, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { ProviderMark } from '@/components/files/file-panel'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select } from '@/components/ui/field'
import { Badge, Card, CardHeader, Meter } from '@/components/ui/surface'
import { useToast } from '@/components/ui/toast'
import { api, errorMessage } from '@/lib/client/api'
import { formatBytes } from '@/lib/files/types'
import { formatRelative } from '@/lib/utils'

export interface AdminProvider {
  id: string
  kind: 'GOOGLE_DRIVE' | 'LOCAL' | 'S3'
  label: string
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
  account: string | null
  isDefault: boolean
  redirect: boolean | null
  projects: number
  files: number
  usage: number | null
}

export interface AdminProject {
  id: string
  name: string
  providerId: string
}

export interface AdminMigration {
  id: string
  project: string
  from: string
  to: string
  status: 'RUNNING' | 'DONE' | 'FAILED'
  totalFiles: number
  movedFiles: number
  totalBytes: number
  movedBytes: number
  error: string | null
  startedAt: string
}

/**
 * Stockages et changements de stockage (CDS V3), pour le super
 * administrateur.
 */
export function StorageAdmin({ providers, projects, migrations }: { providers: AdminProvider[]; projects: AdminProject[]; migrations: AdminMigration[] }) {
  const connected = providers.filter((provider) => provider.status === 'CONNECTED')
  return (
    <>
      <S3Providers providers={providers.filter((provider) => provider.kind === 'S3')} />
      <AddS3Form />
      <DefaultProvider providers={connected} />
      <Migrations providers={connected} projects={projects} migrations={migrations} />
    </>
  )
}

function useRefresh() {
  const router = useRouter()
  const [, startTransition] = useTransition()
  return () => startTransition(() => router.refresh())
}

function S3Providers({ providers }: { providers: AdminProvider[] }) {
  const toast = useToast()
  const refresh = useRefresh()

  async function patch(provider: AdminProvider, body: Record<string, unknown>, done: string) {
    try {
      await api(`/api/v1/storage/${provider.id}`, { method: 'PATCH', body })
      toast.success(done, provider.label)
      refresh()
    } catch (error) {
      toast.error('Modification impossible', errorMessage(error))
    }
  }

  async function remove(provider: AdminProvider) {
    try {
      await api(`/api/v1/storage/${provider.id}`, { method: 'DELETE' })
      toast.success('Stockage retiré', provider.label)
      refresh()
    } catch (error) {
      toast.error('Retrait impossible', errorMessage(error))
    }
  }

  return providers.map((provider) => (
    <Card key={provider.id} className="animate-rise stagger-2">
      <CardHeader
        title={provider.label}
        description="Stockage compatible S3. Les clés sont chiffrées et ne sont jamais réaffichées."
        actions={
          <span className="flex gap-1.5">
            {provider.isDefault && <Badge tone="accent">Nouveaux projets</Badge>}
            {provider.status === 'CONNECTED' ? <Badge tone="success">Connecté</Badge> : <Badge tone="danger">Accès perdu</Badge>}
          </span>
        }
      />
      <div className="space-y-4 px-5 pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <ProviderMark kind="S3" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[0.8rem] text-ink">{provider.account}</p>
            <p className="text-xs text-muted">
              {provider.projects} projet{provider.projects > 1 ? 's' : ''} · {provider.files} fichier{provider.files > 1 ? 's' : ''}
              {provider.usage !== null ? ` · ${formatBytes(provider.usage)}` : ''}
            </p>
          </div>
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-line px-3.5 py-3">
          <Checkbox
            checked={provider.redirect ?? false}
            onChange={(event) =>
              patch(provider, { redirect: event.target.checked }, event.target.checked ? 'Diffusion directe activée' : 'Diffusion directe désactivée')
            }
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="flex items-center gap-1.5 font-medium text-ink">
              <Zap className="h-3.5 w-3.5 text-accent" />
              Diffusion directe
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-2">
              Un lien temporaire redirige vers une adresse signée du compartiment : les octets ne passent plus par le serveur. Pour une lecture par script
              depuis un autre site, autorisez cette origine dans les règles CORS du compartiment.
            </span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          {!provider.isDefault && provider.status === 'CONNECTED' && (
            <Button size="sm" icon={<Star className="h-3.5 w-3.5" />} onClick={() => patch(provider, { isDefault: true }, 'Fournisseur des nouveaux projets')}>
              Utiliser pour les nouveaux projets
            </Button>
          )}
          {provider.projects === 0 && provider.files === 0 && (
            <Button size="sm" variant="danger-ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => remove(provider)}>
              Retirer
            </Button>
          )}
        </div>
      </div>
    </Card>
  ))
}

const PRESETS = [
  { id: 'r2', label: 'Cloudflare R2', endpoint: 'https://<compte>.r2.cloudflarestorage.com', region: 'auto' },
  { id: 's3', label: 'AWS S3', endpoint: 'https://s3.eu-west-3.amazonaws.com', region: 'eu-west-3' },
  { id: 'b2', label: 'Backblaze B2', endpoint: 'https://s3.eu-central-003.backblazeb2.com', region: 'eu-central-003' },
  { id: 'autre', label: 'Autre service compatible', endpoint: '', region: 'auto' },
]

function AddS3Form() {
  const toast = useToast()
  const refresh = useRefresh()
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState('r2')
  const [form, setForm] = useState({ name: 'Cloudflare R2', endpoint: '', region: 'auto', bucket: '', accessKeyId: '', secretAccessKey: '', redirect: true })
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value })
  const current = PRESETS.find((item) => item.id === preset)!

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await api('/api/v1/storage/s3', { method: 'POST', body: form })
      toast.success('Stockage relié', `${form.name} : le compartiment répond.`)
      setOpen(false)
      setForm({ ...form, accessKeyId: '', secretAccessKey: '' })
      refresh()
    } catch (error) {
      toast.error('Connexion impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="animate-rise stagger-3">
      <CardHeader
        title="Ajouter un stockage compatible S3"
        icon={<Cloud />}
        description="Cloudflare R2, AWS S3, Backblaze B2 ou tout service qui parle S3. Les clés sont testées avant d’être enregistrées."
        actions={
          !open ? (
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>
              Ajouter
            </Button>
          ) : undefined
        }
      />
      {open && (
        <form onSubmit={submit} className="animate-fade grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Service" htmlFor="s3-preset">
            <Select
              id="s3-preset"
              value={preset}
              onChange={(event) => {
                const next = PRESETS.find((item) => item.id === event.target.value)!
                setPreset(next.id)
                setForm({ ...form, name: next.id === 'autre' ? form.name : next.label, region: next.region })
              }}
            >
              {PRESETS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nom affiché" htmlFor="s3-name">
            <Input id="s3-name" value={form.name} onChange={set('name')} required minLength={2} maxLength={60} />
          </Field>
          <Field label="Point d’accès" htmlFor="s3-endpoint" className="sm:col-span-2" hint={current.endpoint ? `Exemple : ${current.endpoint}` : undefined}>
            <Input id="s3-endpoint" type="url" value={form.endpoint} onChange={set('endpoint')} required placeholder="https://" className="font-mono text-[0.8rem]" />
          </Field>
          <Field label="Compartiment" htmlFor="s3-bucket">
            <Input id="s3-bucket" value={form.bucket} onChange={set('bucket')} required className="font-mono text-[0.8rem]" placeholder="karaks-medias" />
          </Field>
          <Field label="Région" htmlFor="s3-region" hint="« auto » pour R2.">
            <Input id="s3-region" value={form.region} onChange={set('region')} className="font-mono text-[0.8rem]" />
          </Field>
          <Field label="Identifiant de clé d’accès" htmlFor="s3-key">
            <Input id="s3-key" value={form.accessKeyId} onChange={set('accessKeyId')} required autoComplete="off" className="font-mono text-[0.8rem]" />
          </Field>
          <Field label="Clé secrète" htmlFor="s3-secret">
            <Input id="s3-secret" type="password" value={form.secretAccessKey} onChange={set('secretAccessKey')} required autoComplete="new-password" className="font-mono text-[0.8rem]" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-2 sm:col-span-2">
            <Checkbox checked={form.redirect} onChange={(event) => setForm({ ...form, redirect: event.target.checked })} />
            Diffusion directe des liens temporaires (recommandée)
          </label>
          <p className="text-xs leading-relaxed text-muted sm:col-span-2">
            Donnez à la clé les droits de lecture, d’écriture et de suppression sur ce seul compartiment, rien de plus.
          </p>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit" variant="primary" loading={busy} icon={<Cloud className="h-4 w-4" />}>
              Tester et enregistrer
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

function DefaultProvider({ providers }: { providers: AdminProvider[] }) {
  const toast = useToast()
  const refresh = useRefresh()
  const current = providers.find((provider) => provider.isDefault)

  async function choose(id: string) {
    try {
      await api(`/api/v1/storage/${id}`, { method: 'PATCH', body: { isDefault: true } })
      toast.success('Fournisseur des nouveaux projets modifié')
      refresh()
    } catch (error) {
      toast.error('Modification impossible', errorMessage(error))
    }
  }

  if (providers.length < 2) return null
  return (
    <Card className="animate-rise stagger-4">
      <CardHeader title="Stockage des nouveaux projets" icon={<Star />} description="Les projets existants restent où ils sont ; déplacez-les ci-dessous." />
      <div className="px-5 pb-5">
        <Select value={current?.id ?? ''} onChange={(event) => choose(event.target.value)} className="max-w-sm" aria-label="Stockage des nouveaux projets">
          {!current && <option value="">Automatique (Google Drive s’il est relié)</option>}
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}
            </option>
          ))}
        </Select>
      </div>
    </Card>
  )
}

function Migrations({ providers, projects, migrations }: { providers: AdminProvider[]; projects: AdminProject[]; migrations: AdminMigration[] }) {
  const toast = useToast()
  const refresh = useRefresh()
  const [project, setProject] = useState(projects[0]?.id ?? '')
  const selected = projects.find((item) => item.id === project)
  const targets = providers.filter((provider) => provider.id !== selected?.providerId)
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const effectiveTarget = targets.some((item) => item.id === target) ? target : targets[0]?.id ?? ''

  async function start() {
    setBusy(true)
    try {
      await api(`/api/v1/projects/${project}/migration`, { method: 'POST', body: { providerId: effectiveTarget } })
      toast.success('Changement de stockage lancé', 'Le projet reste en service pendant la copie.')
      refresh()
    } catch (error) {
      toast.error('Lancement impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (providers.length < 2 || projects.length === 0) return null
  return (
    <Card className="animate-rise stagger-5">
      <CardHeader
        title="Changer le stockage d’un projet"
        icon={<ArrowRightLeft />}
        description="Les fichiers sont copiés un à un puis effacés de l’ancien stockage. Le projet reste lisible pendant toute la copie."
      />
      <div className="flex flex-wrap items-end gap-3 px-5 pb-5">
        <Field label="Projet" htmlFor="mig-project" className="min-w-52 flex-1">
          <Select id="mig-project" value={project} onChange={(event) => setProject(event.target.value)}>
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {providers.find((provider) => provider.id === item.providerId)?.label ?? 'autre stockage'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vers" htmlFor="mig-target" className="min-w-52 flex-1">
          <Select id="mig-target" value={effectiveTarget} onChange={(event) => setTarget(event.target.value)}>
            {targets.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" loading={busy} disabled={!effectiveTarget} icon={<ArrowRightLeft className="h-4 w-4" />} onClick={start}>
          Déplacer le projet
        </Button>
      </div>
      {migrations.length > 0 && (
        <ul className="border-t border-line">
          {migrations.map((migration) => (
            <MigrationRow key={migration.id} migration={migration} onChange={refresh} />
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * Une migration en cours avance tant que la page est ouverte : chaque appel
 * copie une quarantaine de secondes de fichiers. Page fermée, la tâche de
 * nuit prend le relais.
 */
function MigrationRow({ migration: initial, onChange }: { migration: AdminMigration; onChange: () => void }) {
  const toast = useToast()
  const [migration, setMigration] = useState(initial)
  const running = migration.status === 'RUNNING'
  const alive = useRef(true)
  const changed = useRef(onChange)
  useEffect(() => {
    changed.current = onChange
  })

  useEffect(() => {
    alive.current = true
    if (initial.status !== 'RUNNING') return
    void (async () => {
      while (alive.current) {
        try {
          const { migration: next } = await api<{ migration: Omit<AdminMigration, 'project' | 'from' | 'to'> }>(`/api/v1/migrations/${initial.id}/step`, { method: 'POST' })
          if (!alive.current) return
          setMigration((current) => ({ ...current, ...next }))
          if (next.status !== 'RUNNING') {
            changed.current()
            return
          }
          // Une erreur (stockage injoignable) : on laisse respirer avant de réessayer.
          if (next.error) await new Promise((resolve) => setTimeout(resolve, 15_000))
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 15_000))
        }
      }
    })()
    return () => {
      alive.current = false
    }
  }, [initial.id, initial.status])

  async function cancel() {
    try {
      const { migration: next } = await api<{ migration: Omit<AdminMigration, 'project' | 'from' | 'to'> }>(`/api/v1/migrations/${migration.id}/cancel`, { method: 'POST' })
      alive.current = false
      setMigration((current) => ({ ...current, ...next }))
      toast.success('Changement de stockage arrêté')
      onChange()
    } catch (error) {
      toast.error('Arrêt impossible', errorMessage(error))
    }
  }

  const percent = migration.totalBytes > 0 ? (migration.movedBytes / migration.totalBytes) * 100 : migration.totalFiles > 0 ? (migration.movedFiles / migration.totalFiles) * 100 : 100
  return (
    <li className="animate-fade space-y-2 border-b border-line px-5 py-3.5 last:border-0">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-ink">{migration.project}</span>
        <span className="text-ink-2">
          {migration.from} → {migration.to}
        </span>
        <span className="text-xs text-muted">{formatRelative(migration.startedAt)}</span>
        <span className="ml-auto flex items-center gap-2">
          {running ? <Badge tone="accent">En cours</Badge> : migration.status === 'DONE' ? <Badge tone="success">Terminée</Badge> : <Badge tone="danger">Arrêtée</Badge>}
          {running && (
            <Button size="sm" variant="danger-ghost" icon={<CircleStop className="h-3.5 w-3.5" />} onClick={cancel}>
              Arrêter
            </Button>
          )}
        </span>
      </div>
      {migration.status !== 'DONE' && (
        <Meter value={Math.min(100, percent)} label={`Progression du changement de stockage de ${migration.project}`} />
      )}
      <p className="text-xs text-ink-2 tabular-nums">
        {migration.movedFiles} / {migration.totalFiles} fichier{migration.totalFiles > 1 ? 's' : ''} · {formatBytes(migration.movedBytes)} sur{' '}
        {formatBytes(migration.totalBytes)}
        {migration.error && <span className="text-danger"> · {migration.error}</span>}
      </p>
    </li>
  )
}
