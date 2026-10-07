'use client'

import { CircleAlert, CircleCheck, Monitor, Moon, Save, Sun, Trash2, TriangleAlert, UserPlus, Unplug } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { ProviderMark } from '@/components/files/file-panel'
import { setTheme } from '@/components/theme/theme-toggle'
import { Button, buttonClass } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Badge, Card, CardHeader, Meter, meterTone } from '@/components/ui/surface'
import { useToast } from '@/components/ui/toast'
import type { ProjectDto } from '@/lib/api/serialize'
import { api, errorMessage } from '@/lib/client/api'
import { formatBytes } from '@/lib/files/types'
import { cn, formatDate } from '@/lib/utils'

const MB = 1024 * 1024

export function ProjectSettingsForm({
  project,
  editable,
  deletable,
  stats,
}: {
  project: ProjectDto
  editable: boolean
  deletable: boolean
  stats: { files: number; bytes: number; keys: number }
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [origins, setOrigins] = useState(project.allowedOrigins.join('\n'))
  const [maxFile, setMaxFile] = useState(String(Math.round(project.maxFileSize / MB)))
  const [quota, setQuota] = useState(project.storageQuota ? String(Math.round(project.storageQuota / (1024 * MB))) : '')
  const [rate, setRate] = useState(String(project.rateLimitPerMinute))
  const [linkRate, setLinkRate] = useState(String(project.signedUrlPerMinute))
  const [retention, setRetention] = useState(String(project.trashRetentionDays))
  const [busy, setBusy] = useState(false)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await api(`/api/v1/projects/${project.id}`, {
        method: 'PATCH',
        body: {
          name,
          description: description || null,
          allowedOrigins: origins.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean),
          maxFileSize: Number(maxFile) * MB,
          storageQuota: quota ? Math.round(Number(quota) * 1024 * MB) : null,
          rateLimitPerMinute: Number(rate),
          signedUrlPerMinute: Number(linkRate),
          trashRetentionDays: Number(retention),
        },
      })
      toast.success('Réglages enregistrés')
      startTransition(() => router.refresh())
    } catch (error) {
      toast.error('Enregistrement impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Card className="animate-rise stagger-1">
        <CardHeader title="Identité du projet" description={`Identifiant public : ${project.id}`} />
        <fieldset disabled={!editable} className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Nom" htmlFor="s-name">
            <Input id="s-name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={60} />
          </Field>
          <Field label="Identifiant lisible" htmlFor="s-slug" hint="Nom du dossier du projet chez le fournisseur.">
            <Input id="s-slug" value={project.slug} readOnly className="font-mono text-[0.8rem] text-ink-2" />
          </Field>
          <Field label="Description" htmlFor="s-description" className="sm:col-span-2">
            <Textarea id="s-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={240} />
          </Field>
        </fieldset>
      </Card>

      <Card className="animate-rise stagger-2">
        <CardHeader title="Origines autorisées (CORS)" description="Seuls ces sites peuvent lire les liens temporaires depuis un script." />
        <fieldset disabled={!editable} className="px-5 pb-5">
          <Field
            label="Une origine par ligne"
            htmlFor="s-origins"
            hint="Nécessaire pour l’analyse du signal (vumètre) et le mode hors connexion de Karaks. Une balise audio simple n’en a pas besoin."
          >
            <Textarea id="s-origins" value={origins} onChange={(event) => setOrigins(event.target.value)} placeholder={'https://karaks.com\nhttps://www.karaks.com'} className="font-mono text-[0.8rem]" />
          </Field>
        </fieldset>
      </Card>

      <Card className="animate-rise stagger-3">
        <CardHeader title="Limites et quotas" description="Une requête au-delà d’une limite reçoit la réponse 429." />
        <fieldset disabled={!editable} className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Taille maximale d’un fichier (Mo)" htmlFor="s-max">
            <Input id="s-max" type="number" min={1} max={5120} value={maxFile} onChange={(event) => setMaxFile(event.target.value)} />
          </Field>
          <Field label="Quota du projet (Go)" htmlFor="s-quota" hint="Vide : limité par l’espace du stockage.">
            <Input id="s-quota" type="number" min={0} step="0.1" value={quota} onChange={(event) => setQuota(event.target.value)} placeholder="Sans quota propre" />
          </Field>
          <Field label="Requêtes API par minute" htmlFor="s-rate">
            <Input id="s-rate" type="number" min={10} max={10000} value={rate} onChange={(event) => setRate(event.target.value)} />
          </Field>
          <Field label="Liens temporaires créés par minute" htmlFor="s-links">
            <Input id="s-links" type="number" min={1} max={1000} value={linkRate} onChange={(event) => setLinkRate(event.target.value)} />
          </Field>
          <Field
            label="Conservation de la corbeille (jours)"
            htmlFor="s-retention"
            hint="Au-delà, un fichier à la corbeille est supprimé définitivement, chez le fournisseur comme ici."
          >
            <Input id="s-retention" type="number" min={1} max={365} value={retention} onChange={(event) => setRetention(event.target.value)} />
          </Field>
        </fieldset>
      </Card>

      {editable && (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={busy} icon={<Save className="h-4 w-4" />}>
            Enregistrer les réglages
          </Button>
        </div>
      )}

      {deletable && <DeleteProjectCard project={project} stats={stats} />}
    </form>
  )
}

/**
 * Suppression d'un projet : irréversible, et elle efface aussi les fichiers
 * chez le fournisseur. Le nom à retaper oblige à lire ce qu'on supprime.
 */
export function DeleteProjectCard({ project, stats }: { project: ProjectDto; stats: { files: number; bytes: number; keys: number } }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    try {
      const data = await api<{ deleted: { name: string; files: number } }>(`/api/v1/projects/${project.id}`, {
        method: 'DELETE',
        body: { confirm },
      })
      toast.success('Projet supprimé', `${data.deleted.name} et ses ${data.deleted.files} fichier${data.deleted.files > 1 ? 's' : ''}`)
      setOpen(false)
      router.push('/projets')
      router.refresh()
    } catch (error) {
      toast.error('Suppression impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="animate-rise stagger-4 border-danger/40">
      <CardHeader title="Supprimer le projet" icon={<Trash2 />} description="Action définitive, réservée au propriétaire du projet." />
      <div className="flex flex-wrap items-center gap-4 px-5 pb-5">
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-2">
          Les {stats.files} fichier{stats.files > 1 ? 's' : ''} ({formatBytes(stats.bytes)}) sont effacés du stockage, corbeille comprise. Les{' '}
          {stats.keys} clé{stats.keys > 1 ? 's' : ''} API, les liens temporaires et les webhooks cessent aussitôt de fonctionner.
        </p>
        <Button
          type="button"
          variant="danger-ghost"
          icon={<Trash2 className="h-4 w-4" />}
          onClick={() => {
            setConfirm('')
            setOpen(true)
          }}
        >
          Supprimer le projet
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={`Supprimer ${project.name} ?`}
        icon={<TriangleAlert className="h-[18px] w-[18px]" />}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="danger" loading={busy} disabled={confirm.trim() !== project.name} onClick={remove}>
              Supprimer définitivement
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm leading-relaxed text-danger">
            {stats.files} fichier{stats.files > 1 ? 's' : ''} et tout le contenu du projet seront effacés. Cette action est irréversible.
          </p>
          <Field label={`Pour confirmer, saisissez « ${project.name} »`} htmlFor="confirm-delete">
            <Input id="confirm-delete" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" data-autofocus />
          </Field>
        </div>
      </Dialog>
    </Card>
  )
}

export interface MemberRow {
  userId: string
  name: string
  email: string
  role: string
  since: string
}

const ROLE_LABELS: Record<string, string> = { OWNER: 'Propriétaire', ADMIN: 'Administration', DEVELOPER: 'Développement', VIEWER: 'Lecture seule' }

export function MembersForm({ project, members, editable }: { project: string; members: MemberRow[]; editable: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('DEVELOPER')
  const [busy, setBusy] = useState(false)
  const refresh = () => startTransition(() => router.refresh())

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await api(`/api/v1/projects/${project}/members`, { method: 'POST', body: { email, role } })
      toast.success('Membre ajouté', email)
      setEmail('')
      refresh()
    } catch (error) {
      toast.error('Ajout impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function change(member: MemberRow, next: string) {
    try {
      await api(`/api/v1/projects/${project}/members`, { method: 'POST', body: { email: member.email, role: next } })
      toast.success('Rôle modifié', `${member.name} : ${ROLE_LABELS[next]}`)
      refresh()
    } catch (error) {
      toast.error('Modification impossible', errorMessage(error))
    }
  }

  async function remove(member: MemberRow) {
    try {
      await api(`/api/v1/projects/${project}/members/${member.userId}`, { method: 'DELETE' })
      toast.success('Membre retiré', member.name)
      refresh()
    } catch (error) {
      toast.error('Retrait impossible', errorMessage(error))
    }
  }

  return (
    <div className="space-y-5">
      {editable && (
        <Card className="animate-rise stagger-1">
          <CardHeader title="Ajouter un membre" description="La personne doit déjà avoir un compte Karaks Storage." />
          <form onSubmit={add} className="flex flex-wrap items-end gap-3 px-5 pb-5">
            <Field label="Adresse email" htmlFor="m-email" className="min-w-60 flex-1">
              <Input id="m-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </Field>
            <Field label="Rôle" htmlFor="m-role">
              <Select id="m-role" value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="ADMIN">Administration</option>
                <option value="DEVELOPER">Développement</option>
                <option value="VIEWER">Lecture seule</option>
              </Select>
            </Field>
            <Button type="submit" variant="primary" loading={busy} icon={<UserPlus className="h-4 w-4" />}>
              Ajouter
            </Button>
          </form>
        </Card>
      )}
      <Card className="animate-rise stagger-2">
        <CardHeader title="Membres du projet" description="Administration : tout ; Développement : tout sauf les réglages ; Lecture seule : lister et diffuser." />
        <ul>
          {members.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">{member.name}</p>
                <p className="text-xs text-muted">
                  {member.email} · depuis le {formatDate(member.since)}
                </p>
              </div>
              {member.role === 'OWNER' || !editable ? (
                <Badge tone={member.role === 'OWNER' ? 'accent' : 'neutral'}>{ROLE_LABELS[member.role]}</Badge>
              ) : (
                <>
                  <Select value={member.role} onChange={(event) => change(member, event.target.value)} className="h-9 w-auto text-[0.82rem]" aria-label={`Rôle de ${member.name}`}>
                    <option value="ADMIN">Administration</option>
                    <option value="DEVELOPER">Développement</option>
                    <option value="VIEWER">Lecture seule</option>
                  </Select>
                  <Button size="sm" variant="danger-ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => remove(member)}>
                    Retirer
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

export interface ProviderRow {
  id: string
  kind: 'GOOGLE_DRIVE' | 'LOCAL'
  name: string
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
  account: string | null
  lastError: string | null
  connectedAt: string | null
  projects: number
  files: number
  quota: { usage: number; limit: number | null } | null
}

export function StorageSettings({
  providers,
  googleConfigured,
  isSuperAdmin,
  notice,
}: {
  providers: ProviderRow[]
  googleConfigured: boolean
  isSuperAdmin: boolean
  notice: { ok: boolean; message: string } | null
}) {
  const drive = providers.find((provider) => provider.kind === 'GOOGLE_DRIVE')
  return (
    <div className="space-y-5">
      {notice && (
        <div className={cn('animate-fade flex gap-3 rounded-xl p-4 text-sm', notice.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')} role="status">
          {notice.ok ? <CircleCheck className="h-5 w-5 shrink-0" /> : <CircleAlert className="h-5 w-5 shrink-0" />}
          {notice.message}
        </div>
      )}

      <Card className="animate-rise stagger-1">
        <CardHeader title="Google Drive" description="Stockage de la première version. L’application n’accède qu’aux fichiers qu’elle a créés (droit drive.file)." />
        <div className="space-y-4 px-5 pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <ProviderMark kind="GOOGLE_DRIVE" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{drive?.account ?? 'Aucun compte relié'}</p>
              <p className="text-xs text-muted">
                {drive?.connectedAt ? `Relié le ${formatDate(drive.connectedAt)}` : 'Dossier racine : KARAKS STORAGE'}
                {drive ? ` · ${drive.projects} projet${drive.projects > 1 ? 's' : ''} · ${drive.files} fichier${drive.files > 1 ? 's' : ''}` : ''}
              </p>
            </div>
            {drive?.status === 'CONNECTED' ? (
              <Badge tone="success">Connecté</Badge>
            ) : drive?.status === 'ERROR' ? (
              <Badge tone="danger">Accès perdu</Badge>
            ) : (
              <Badge>Non connecté</Badge>
            )}
          </div>

          {drive?.lastError && drive.status === 'ERROR' && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{drive.lastError}</p>}

          {drive?.quota?.limit && (
            <div>
              <Meter value={(drive.quota.usage / drive.quota.limit) * 100} tone={meterTone((drive.quota.usage / drive.quota.limit) * 100)} label="Espace du compte Google" />
              <p className="mt-2 text-xs text-ink-2 tabular-nums">
                {formatBytes(drive.quota.usage)} utilisés sur {formatBytes(drive.quota.limit)} (Gmail et Photos compris)
              </p>
            </div>
          )}

          {isSuperAdmin ? (
            googleConfigured ? (
              <a href="/api/v1/storage/google/connect" className={buttonClass(drive?.status === 'CONNECTED' ? 'secondary' : 'primary', 'md')}>
                <Unplug className="h-4 w-4" />
                {drive?.status === 'CONNECTED' ? 'Reconnecter Google Drive' : 'Connecter Google Drive'}
              </a>
            ) : (
              <p className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-ink-2">
                Renseignez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans la configuration du serveur, avec l’URI de redirection
                <code className="mx-1 font-mono text-ink">/api/v1/storage/google/callback</code>, puis revenez ici.
              </p>
            )
          ) : (
            <p className="text-xs text-muted">Seul le super administrateur relie le stockage.</p>
          )}
        </div>
      </Card>

      {providers
        .filter((provider) => provider.kind === 'LOCAL')
        .map((provider) => (
          <Card key={provider.id} className="animate-rise stagger-2">
            <CardHeader title="Disque local" description="Réservé au développement et aux tests : désactivé en production." />
            <p className="px-5 pb-5 text-xs text-ink-2">
              {provider.projects} projet{provider.projects > 1 ? 's' : ''} et {provider.files} fichier{provider.files > 1 ? 's' : ''} sur ce disque. Les nouveaux
              projets iront sur Google Drive dès qu’il sera connecté.
            </p>
          </Card>
        ))}
    </div>
  )
}

export interface UserRow {
  id: string
  name: string
  email: string
  role: string
  status: string
  twoFactorEnabled: boolean
  projects: number
  createdAt: string
}

const GLOBAL_ROLES: Record<string, string> = {
  SUPER_ADMIN: 'Super administrateur',
  ADMIN: 'Administrateur',
  DEVELOPER: 'Développeur',
  USER: 'Utilisateur',
  SERVICE: 'Compte de service',
}

export function UsersAdmin({ users, me, isSuperAdmin }: { users: UserRow[]; me: string; isSuperAdmin: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  async function update(user: UserRow, change: { role?: string; status?: string }) {
    try {
      await api(`/api/v1/users/${user.id}`, { method: 'PATCH', body: change })
      toast.success('Compte modifié', user.name)
      startTransition(() => router.refresh())
    } catch (error) {
      toast.error('Modification impossible', errorMessage(error))
    }
  }

  return (
    <Card className="animate-rise stagger-1">
      <CardHeader title="Comptes" description="Les administrateurs créent des projets ; les autres comptes accèdent aux projets dont ils sont membres." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-[0.84rem]">
          <thead>
            <tr className="border-y border-line text-[0.78rem] text-ink-2">
              <th className="py-2.5 pl-5 font-medium">Compte</th>
              <th className="py-2.5 font-medium">Rôle</th>
              <th className="py-2.5 font-medium">Projets</th>
              <th className="py-2.5 font-medium">Inscrit le</th>
              <th className="py-2.5 pr-5 font-medium">État</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const locked = user.id === me || (user.role === 'SUPER_ADMIN' && !isSuperAdmin)
              return (
                <tr key={user.id} className="border-b border-line last:border-b-0">
                  <td className="py-2.5 pl-5">
                    <p className="text-ink">{user.name}</p>
                    <p className="text-xs text-muted">
                      {user.email}
                      {user.twoFactorEnabled && <span className="ml-2 text-success">double authentification</span>}
                    </p>
                  </td>
                  <td className="py-2.5">
                    {locked ? (
                      <Badge tone="accent">{GLOBAL_ROLES[user.role]}</Badge>
                    ) : (
                      <Select value={user.role} onChange={(event) => update(user, { role: event.target.value })} className="h-8 w-auto text-[0.8rem]" aria-label={`Rôle de ${user.name}`}>
                        {Object.entries(GLOBAL_ROLES)
                          .filter(([value]) => isSuperAdmin || value !== 'SUPER_ADMIN')
                          .map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                      </Select>
                    )}
                  </td>
                  <td className="py-2.5 text-ink-2 tabular-nums">{user.projects}</td>
                  <td className="py-2.5 text-ink-2">{formatDate(user.createdAt)}</td>
                  <td className="py-2.5 pr-5">
                    {locked ? (
                      <Badge tone="success">Actif</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant={user.status === 'ACTIVE' ? 'danger-ghost' : 'secondary'}
                        onClick={() => update(user, { status: user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}
                      >
                        {user.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export function AppearanceSettings() {
  const options = [
    { value: 'dark' as const, label: 'Sombre', icon: Moon },
    { value: 'light' as const, label: 'Clair', icon: Sun },
    { value: 'system' as const, label: 'Système', icon: Monitor },
  ]
  return (
    <Card className="animate-rise stagger-1">
      <CardHeader title="Thème" description="Le choix est propre à ce navigateur." />
      <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className="flex items-center gap-3 rounded-xl border border-line-strong p-4 text-left text-sm text-ink transition-colors hover:bg-surface-2"
          >
            <option.icon className="h-5 w-5 text-ink-2" />
            {option.label}
          </button>
        ))}
      </div>
    </Card>
  )
}
