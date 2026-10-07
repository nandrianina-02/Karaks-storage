'use client'

import { Check, CircleAlert, CircleCheck, Copy, History, Plus, Send, Trash2, TriangleAlert, Webhook } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Loader } from '@/components/brand/loader'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input } from '@/components/ui/field'
import { ActionMenu } from '@/components/ui/menu'
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/surface'
import { useToast } from '@/components/ui/toast'
import type { WebhookDto } from '@/lib/api/serialize'
import { api, errorMessage } from '@/lib/client/api'
import { cn, formatDate, formatRelative } from '@/lib/utils'

interface Delivery {
  id: string
  event: string
  success: boolean
  statusCode: number | null
  error: string | null
  durationMs: number | null
  attempt: number
  nextAttemptAt: string | null
  createdAt: string
}

const VERIFY_SNIPPET = `import { createHmac, timingSafeEqual } from 'node:crypto'

// En-tête : Karaks-Signature: t=<horodatage>,v1=<signature>
export function verify(body, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((part) => part.split('=')))
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false
  const expected = createHmac('sha256', secret).update(\`\${t}.\${body}\`).digest('hex')
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
}`

/** Webhooks (CDS 19) : abonnements, essai, historique des envois. */
export function WebhooksManager({
  project,
  hooks,
  events,
}: {
  project: string
  hooks: WebhookDto[]
  events: { value: string; label: string }[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [history, setHistory] = useState<WebhookDto | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null)
  const [deleting, setDeleting] = useState<WebhookDto | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = () => startTransition(() => router.refresh())

  async function test(hook: WebhookDto) {
    try {
      const data = await api<{ delivery: { success: boolean; statusCode: number | null; error: string | null } }>(
        `/api/v1/webhooks/${hook.id}/test`,
        { method: 'POST', project },
      )
      if (data.delivery.success) toast.success('Envoi d’essai reçu', `Réponse ${data.delivery.statusCode}`)
      else toast.error('Envoi d’essai refusé', data.delivery.error ?? undefined)
      refresh()
    } catch (error) {
      toast.error('Essai impossible', errorMessage(error))
    }
  }

  async function toggle(hook: WebhookDto) {
    try {
      await api(`/api/v1/webhooks/${hook.id}`, { method: 'PATCH', project, body: { active: !hook.active } })
      toast.success(hook.active ? 'Webhook suspendu' : 'Webhook réactivé')
      refresh()
    } catch (error) {
      toast.error('Modification impossible', errorMessage(error))
    }
  }

  async function openHistory(hook: WebhookDto) {
    setHistory(hook)
    setDeliveries(null)
    try {
      const data = await api<{ deliveries: Delivery[] }>(`/api/v1/webhooks/${hook.id}`, { project })
      setDeliveries(data.deliveries)
    } catch (error) {
      toast.error('Historique indisponible', errorMessage(error))
      setDeliveries([])
    }
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    try {
      await api(`/api/v1/webhooks/${deleting.id}`, { method: 'DELETE', project })
      toast.success('Webhook supprimé')
      setDeleting(null)
      refresh()
    } catch (error) {
      toast.error('Suppression impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const labels = new Map(events.map((event) => [event.value, event.label]))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Prévenez vos applications quand un fichier est téléversé, modifié, supprimé ou lu."
        actions={
          <Button variant="primary" icon={<Plus className="h-[18px] w-[18px]" />} onClick={() => setCreating(true)}>
            Nouveau webhook
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="animate-rise stagger-1 h-fit">
          {hooks.length === 0 ? (
            <EmptyState
              icon={<Webhook />}
              title="Aucun webhook"
              description="Ajoutez l’adresse d’un serveur, par exemple https://api.karaks.com/webhooks/storage, et choisissez les événements à recevoir."
            />
          ) : (
            <ul>
              {hooks.map((hook, index) => (
                <li key={hook.id} className={cn('animate-fade flex flex-wrap items-start gap-3 border-b border-line px-5 py-4 last:border-b-0', `stagger-${Math.min(index + 1, 6)}`)}>
                  <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg', hook.active ? 'bg-accent-soft text-accent' : 'bg-surface-3 text-muted')}>
                    <Webhook className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[0.82rem] text-ink">{hook.url}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {hook.events.map((event) => (
                        <Badge key={event}>{labels.get(event) ?? event}</Badge>
                      ))}
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                      {hook.lastDelivery ? (
                        <>
                          {hook.lastDelivery.success ? <CircleCheck className="h-3.5 w-3.5 text-success" /> : <CircleAlert className="h-3.5 w-3.5 text-danger" />}
                          Dernier envoi {formatRelative(hook.lastDelivery.at)}
                          {hook.lastDelivery.statusCode ? ` · réponse ${hook.lastDelivery.statusCode}` : ''}
                        </>
                      ) : (
                        'Aucun envoi pour l’instant'
                      )}
                    </p>
                  </div>
                  <Badge tone={hook.active ? 'success' : 'neutral'}>{hook.active ? 'Actif' : 'Suspendu'}</Badge>
                  <ActionMenu
                    label={`Actions sur ${hook.url}`}
                    items={[
                      { label: 'Envoyer un essai', icon: <Send />, onSelect: () => void test(hook) },
                      { label: 'Historique des envois', icon: <History />, onSelect: () => void openHistory(hook) },
                      { label: hook.active ? 'Suspendre' : 'Réactiver', icon: <Webhook />, onSelect: () => void toggle(hook) },
                      { label: 'Supprimer', icon: <Trash2 />, tone: 'danger', separatorBefore: true, onSelect: () => setDeleting(hook) },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="animate-rise stagger-2 h-fit">
          <CardHeader title="Vérifier la signature" description="Chaque envoi est signé avec le secret du webhook." />
          <pre className="mx-5 mb-5 overflow-x-auto rounded-lg border border-line bg-bg p-3.5 font-mono text-[0.72rem] leading-relaxed text-ink-2">{VERIFY_SNIPPET}</pre>
          <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">
            Les envois de plus de cinq minutes sont refusés par cette vérification : un envoi intercepté ne peut pas être rejoué plus tard.
          </p>
        </Card>
      </div>

      <CreateWebhookDialog open={creating} project={project} events={events} onClose={() => setCreating(false)} onCreated={refresh} />

      <Dialog open={history !== null} onClose={() => setHistory(null)} size="lg" title="Historique des envois" description={history?.url} icon={<History className="h-[18px] w-[18px]" />}>
        {deliveries === null ? (
          <Loader className="py-8" />
        ) : deliveries.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-2">Aucun envoi enregistré.</p>
        ) : (
          <ul className="divide-y divide-line">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="flex items-center gap-3 py-2.5 text-sm">
                {delivery.success ? <CircleCheck className="h-4 w-4 text-success" /> : <CircleAlert className="h-4 w-4 text-danger" />}
                <span className="font-mono text-[0.78rem] text-ink">{delivery.event}</span>
                <span className="flex-1 truncate text-xs text-muted">
                  {delivery.error ?? `Réponse ${delivery.statusCode}`}
                  {delivery.attempt > 1 && ` · tentative ${delivery.attempt}`}
                  {delivery.nextAttemptAt && ` · nouvel essai ${formatRelative(delivery.nextAttemptAt)}`}
                </span>
                <span className="text-xs text-ink-2 tabular-nums">{delivery.durationMs} ms</span>
                <span className="text-xs whitespace-nowrap text-muted">{formatDate(delivery.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        size="sm"
        title="Supprimer ce webhook ?"
        description={deleting?.url}
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

function CreateWebhookDialog({
  open,
  project,
  events,
  onClose,
  onCreated,
}: {
  open: boolean
  project: string
  events: { value: string; label: string }[]
  onClose: () => void
  onCreated: () => void
}) {
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set(['file.uploaded', 'file.deleted']))
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function close() {
    setUrl('')
    setSecret(null)
    setCopied(false)
    onClose()
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const data = await api<{ secret: string }>('/api/v1/webhooks', { method: 'POST', project, body: { url, events: [...selected] } })
      setSecret(data.secret)
      onCreated()
    } catch (error) {
      toast.error('Création impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={secret ? 'Webhook créé' : 'Nouveau webhook'}
      icon={<Webhook className="h-[18px] w-[18px]" />}
      footer={
        secret ? (
          <Button variant="primary" onClick={close}>
            Terminé
          </Button>
        ) : undefined
      }
    >
      {secret ? (
        <div className="animate-fade space-y-3">
          <div className="flex gap-3 rounded-lg bg-warning-soft p-3 text-sm text-warning">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Le secret de signature n’est affiché qu’une fois. Conservez-le sur le serveur qui reçoit les envois.</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface-2 p-1.5 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-[0.8rem] text-ink">{secret}</code>
            <Button
              size="sm"
              variant="primary"
              icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              onClick={async () => {
                await navigator.clipboard.writeText(secret)
                setCopied(true)
              }}
            >
              {copied ? 'Copié' : 'Copier'}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Adresse de réception" htmlFor="hook-url" hint="HTTPS et adresse publique en production.">
            <Input id="hook-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://api.karaks.com/webhooks/storage" required data-autofocus />
          </Field>
          <fieldset>
            <legend className="text-[0.8rem] font-medium text-ink-2">Événements</legend>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {events.map((event) => (
                <label key={event.value} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.has(event.value)}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current)
                        if (next.has(event.value)) next.delete(event.value)
                        else next.add(event.value)
                        return next
                      })
                    }
                  />
                  <span>
                    <span className="block font-mono text-[0.78rem] text-ink">{event.value}</span>
                    <span className="block text-xs text-muted">{event.label}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button onClick={close}>Annuler</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!url || selected.size === 0}>
              Créer le webhook
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
