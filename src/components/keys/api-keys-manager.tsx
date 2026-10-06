'use client'

import { Ban, Check, Copy, KeyRound, Plus, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select } from '@/components/ui/field'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/surface'
import { useToast } from '@/components/ui/toast'
import type { ApiKeyDto } from '@/lib/api/serialize'
import { api, errorMessage } from '@/lib/client/api'
import { API_KEY_PERMISSIONS, DEFAULT_KEY_PERMISSIONS, PERMISSION_LABELS, type Permission } from '@/lib/security/permissions'
import { cn, formatDate, formatRelative } from '@/lib/utils'

const PRESETS: { label: string; description: string; permissions: Permission[] }[] = [
  { label: 'Application cliente', description: 'Ce dont Karaks a besoin : lire, téléverser, diffuser, créer des liens.', permissions: DEFAULT_KEY_PERMISSIONS },
  { label: 'Lecture seule', description: 'Lister et diffuser, sans rien modifier.', permissions: ['files:read', 'folders:read', 'stream:read', 'download:read'] },
  { label: 'Accès complet', description: 'Toutes les permissions accordables à une clé.', permissions: API_KEY_PERMISSIONS },
]

/** Clés API (CDS 6.4) : la clé secrète n'est affichée qu'à sa création. */
export function ApiKeysManager({ project, keys }: { project: string; keys: ApiKeyDto[] }) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<ApiKeyDto | null>(null)
  const [busy, setBusy] = useState(false)

  async function revoke() {
    if (!revoking) return
    setBusy(true)
    try {
      await api(`/api/v1/api-keys/${revoking.id}`, { method: 'DELETE', project })
      toast.success('Clé révoquée', `${revoking.name} est refusée dès la prochaine requête.`)
      setRevoking(null)
      startTransition(() => router.refresh())
    } catch (error) {
      toast.error('Révocation impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const active = keys.filter((key) => !key.revokedAt)
  const revoked = keys.filter((key) => key.revokedAt)

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description="Clés d’accès des applications clientes. Chaque clé ne sert que ce projet, avec les permissions choisies."
        actions={
          <Button variant="primary" icon={<Plus className="h-[18px] w-[18px]" />} onClick={() => setCreating(true)}>
            Nouvelle clé
          </Button>
        }
      />

      <Card className="animate-rise stagger-1">
        {keys.length === 0 ? (
          <EmptyState
            icon={<KeyRound />}
            title="Aucune clé API"
            description="Créez une clé pour que Karaks, Moziik ou un script puisse appeler l’API de ce projet."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                Créer une clé
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[0.86rem]">
              <thead>
                <tr className="border-b border-line text-[0.8rem] text-ink-2">
                  <th className="py-3 pl-5 font-medium">Nom</th>
                  <th className="py-3 font-medium">Clé</th>
                  <th className="py-3 font-medium">Permissions</th>
                  <th className="py-3 font-medium">Créée le</th>
                  <th className="py-3 font-medium">Dernière utilisation</th>
                  <th className="py-3 pr-5" />
                </tr>
              </thead>
              <tbody>
                {[...active, ...revoked].map((key, index) => (
                  <tr key={key.id} className={cn('animate-fade border-b border-line last:border-b-0', key.revokedAt && 'opacity-60', `stagger-${Math.min(index + 1, 6)}`)}>
                    <td className="py-3 pl-5">
                      <span className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-ink-2">
                          <KeyRound className="h-4 w-4" />
                        </span>
                        <span className="text-ink">{key.name}</span>
                      </span>
                    </td>
                    <td className="py-3 font-mono text-[0.78rem] text-ink-2">{key.prefix}…</td>
                    <td className="py-3">
                      <span className="flex max-w-xs flex-wrap gap-1">
                        {key.permissions.slice(0, 3).map((permission) => (
                          <Badge key={permission}>{permission}</Badge>
                        ))}
                        {key.permissions.length > 3 && (
                          <span title={key.permissions.slice(3).join(', ')}>
                            <Badge>+{key.permissions.length - 3}</Badge>
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 whitespace-nowrap text-ink-2">{formatDate(key.createdAt)}</td>
                    <td className="py-3 whitespace-nowrap text-ink-2">
                      {key.lastUsedAt ? formatRelative(key.lastUsedAt) : <span className="text-muted">Jamais</span>}
                    </td>
                    <td className="py-3 pr-5 text-right">
                      {key.revokedAt ? (
                        <Badge tone="danger">Révoquée</Badge>
                      ) : key.expiresAt && new Date(key.expiresAt) < new Date() ? (
                        <Badge>Expirée</Badge>
                      ) : (
                        <Button size="sm" variant="danger-ghost" icon={<Ban className="h-3.5 w-3.5" />} onClick={() => setRevoking(key)}>
                          Révoquer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="animate-rise stagger-2 p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div className="text-sm leading-relaxed text-ink-2">
            <p className="font-medium text-ink">Une clé reste côté serveur</p>
            <p className="mt-1">
              Ne placez jamais une clé dans une application web ou Android : elle y serait lisible. Le serveur de votre application appelle
              l’API avec la clé et remet au lecteur un lien temporaire, qui expire de lui-même.
            </p>
          </div>
        </div>
      </Card>

      <CreateKeyDialog
        open={creating}
        project={project}
        onClose={() => setCreating(false)}
        onCreated={() => startTransition(() => router.refresh())}
      />

      <Dialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        size="sm"
        title={`Révoquer ${revoking?.name ?? 'la clé'} ?`}
        description="Les applications qui l’utilisent seront refusées dès leur prochaine requête. Une clé révoquée ne se réactive pas."
        icon={<Ban className="h-[18px] w-[18px]" />}
        footer={
          <>
            <Button onClick={() => setRevoking(null)}>Annuler</Button>
            <Button variant="danger" loading={busy} onClick={revoke}>
              Révoquer la clé
            </Button>
          </>
        }
      />
    </div>
  )
}

function CreateKeyDialog({
  open,
  project,
  onClose,
  onCreated,
}: {
  open: boolean
  project: string
  onClose: () => void
  onCreated: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set(DEFAULT_KEY_PERMISSIONS))
  const [expires, setExpires] = useState('')
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function close() {
    setName('')
    setPermissions(new Set(DEFAULT_KEY_PERMISSIONS))
    setExpires('')
    setSecret(null)
    setCopied(false)
    onClose()
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const data = await api<{ secret: string }>('/api/v1/api-keys', {
        method: 'POST',
        project,
        body: { name, permissions: [...permissions], expiresInDays: expires ? Number(expires) : null },
      })
      setSecret(data.secret)
      onCreated()
    } catch (error) {
      toast.error('Création impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!secret) return
    await navigator.clipboard.writeText(secret)
    setCopied(true)
    toast.success('Clé copiée')
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title={secret ? 'Clé créée' : 'Nouvelle clé API'}
      description={secret ? undefined : 'Choisissez le moins de permissions possible : une clé compromise ne pourra faire que cela.'}
      icon={<KeyRound className="h-[18px] w-[18px]" />}
      footer={
        secret ? (
          <Button variant="primary" onClick={close} disabled={!copied}>
            {copied ? 'J’ai mis la clé en lieu sûr' : 'Copiez la clé pour continuer'}
          </Button>
        ) : undefined
      }
    >
      {secret ? (
        <div className="animate-fade space-y-4">
          <div className="flex gap-3 rounded-lg bg-warning-soft p-3 text-sm text-warning">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Cette clé ne sera plus jamais affichée : seule son empreinte est conservée. Copiez-la maintenant.</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface-2 p-1.5 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-[0.8rem] text-ink">{secret}</code>
            <Button size="sm" variant="primary" icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} onClick={copy}>
              {copied ? 'Copiée' : 'Copier'}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-[0.75rem] leading-relaxed text-ink-2">
            {`curl ${typeof window === 'undefined' ? '' : window.location.origin}/api/v1/files \\\n  -H "Authorization: Bearer ${secret.slice(0, 12)}…"`}
          </pre>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom" htmlFor="key-name" hint="Pour la reconnaître : « Karaks web », « Script de migration »...">
              <Input id="key-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} data-autofocus />
            </Field>
            <Field label="Expiration" htmlFor="key-expires">
              <Select id="key-expires" value={expires} onChange={(event) => setExpires(event.target.value)}>
                <option value="">Jamais (jusqu’à révocation)</option>
                <option value="30">Dans 30 jours</option>
                <option value="90">Dans 90 jours</option>
                <option value="365">Dans un an</option>
              </Select>
            </Field>
          </div>

          <div>
            <p className="text-[0.8rem] font-medium text-ink-2">Préréglages</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {PRESETS.map((preset) => {
                const selected = preset.permissions.length === permissions.size && preset.permissions.every((item) => permissions.has(item))
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setPermissions(new Set(preset.permissions))}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors',
                      selected ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-surface-2',
                    )}
                  >
                    <span className="block text-sm font-medium text-ink">{preset.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">{preset.description}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <fieldset>
            <legend className="text-[0.8rem] font-medium text-ink-2">Permissions</legend>
            <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {API_KEY_PERMISSIONS.map((permission) => (
                <label key={permission} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <Checkbox
                    className="mt-0.5"
                    checked={permissions.has(permission)}
                    onChange={() =>
                      setPermissions((current) => {
                        const next = new Set(current)
                        if (next.has(permission)) next.delete(permission)
                        else next.add(permission)
                        return next
                      })
                    }
                  />
                  <span>
                    <span className="block font-mono text-[0.78rem] text-ink">{permission}</span>
                    <span className="block text-xs text-muted">{PERMISSION_LABELS[permission]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button onClick={close}>Annuler</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!name.trim() || permissions.size === 0}>
              Créer la clé
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
