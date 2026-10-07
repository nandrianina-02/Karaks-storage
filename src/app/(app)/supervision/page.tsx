import { Activity, CloudUpload, Database, ExternalLink, Gauge, HardDrive, Mail, MapPin, Timer, Webhook, Wrench } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { StatTile } from '@/components/dashboard/stat-tile'
import { LevelBadge, OVERALL } from '@/components/supervision/level'
import { RunMaintenanceButton } from '@/components/supervision/run-maintenance'
import { TestEmailButton } from '@/components/supervision/test-email'
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/surface'
import { supervision } from '@/lib/services/health'
import { formatCount, formatRelative } from '@/lib/utils'
import { getWorkspace } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Supervision' }
export const dynamic = 'force-dynamic'

const ICONS: Record<string, typeof Activity> = { database: Database, maintenance: Timer, webhooks: Webhook }

interface RunReport {
  trashPurged?: number
  uploadsAborted?: number
  webhooksRetried?: number
  deliveriesPruned?: number
  incomplete?: boolean
  errors?: string[]
}

/** Supervision du service (CDS V2), réservée au super administrateur. */
export default async function SupervisionPage() {
  const workspace = await getWorkspace()
  if (workspace.user.role !== 'SUPER_ADMIN') redirect('/dashboard')
  const state = await supervision()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supervision"
        description="État des composants du service, tâches automatiques et envois en échec."
        actions={
          <>
            <Link href="/statut" target="_blank" className="flex items-center gap-1.5 text-[0.84rem] text-ink-2 hover:text-ink">
              Page de statut publique
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <RunMaintenanceButton />
          </>
        }
      />

      <Card className="animate-rise stagger-1">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <LevelBadge level={state.level} />
          <p className="text-sm text-ink">{OVERALL[state.level]}</p>
          <p className="ml-auto text-xs text-muted">Contrôlé {formatRelative(state.checkedAt)}</p>
        </div>
        <ul>
          {state.checks.map((check, index) => {
            const Icon = ICONS[check.id] ?? HardDrive
            return (
              <li key={check.id} className={`animate-fade flex items-center gap-3 px-5 py-3 ${index > 0 ? 'border-t border-line' : ''}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-ink-2">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{check.label}</p>
                  <p className="truncate text-xs text-ink-2" title={check.detail}>
                    {check.detail}
                  </p>
                </div>
                {check.latencyMs !== undefined && <span className="hidden text-xs text-muted tabular-nums sm:inline">{check.latencyMs} ms</span>}
                <LevelBadge level={check.level} />
              </li>
            )
          })}
        </ul>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<Webhook />} label="Webhooks envoyés (24 h)" value={formatCount(state.webhookStats.total)} className="stagger-2" />
        <StatTile icon={<Activity />} label="Webhooks en échec (24 h)" value={formatCount(state.webhookStats.failed)} className="stagger-3" />
        <StatTile icon={<Timer />} label="Relances prévues" value={formatCount(state.webhookStats.pending)} className="stagger-4" />
        <StatTile icon={<CloudUpload />} label="Envois reprenables ouverts" value={formatCount(state.uploads.PENDING ?? 0)} className="stagger-5" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="animate-rise stagger-3">
          <CardHeader title="Passages de maintenance" icon={<Wrench />} description="Corbeille, envois abandonnés, relances de webhooks. Chaque nuit à 2 h 30 (UTC)." />
          {state.runs.length === 0 ? (
            <EmptyState icon={<Timer />} title="Aucun passage pour l’instant" description="Le premier aura lieu cette nuit, ou maintenant avec le bouton ci-dessus." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[0.84rem]">
                <thead>
                  <tr className="border-y border-line text-[0.78rem] text-ink-2">
                    <th className="py-2.5 pl-5 font-medium">Début</th>
                    <th className="py-2.5 font-medium">Origine</th>
                    <th className="py-2.5 font-medium">Durée</th>
                    <th className="py-2.5 font-medium">Résultat</th>
                    <th className="py-2.5 pr-5 font-medium">État</th>
                  </tr>
                </thead>
                <tbody>
                  {state.runs.map((run) => {
                    const report = (run.report ?? {}) as RunReport
                    const duration = run.finishedAt ? Math.max(0, Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 100) / 10) : null
                    const failed = Boolean(run.error) || (report.errors?.length ?? 0) > 0
                    return (
                      <tr key={run.id} className="border-b border-line last:border-0">
                        <td className="py-2.5 pl-5 whitespace-nowrap text-ink">{formatRelative(run.startedAt)}</td>
                        <td className="py-2.5 text-ink-2">{run.trigger === 'cron' ? 'Planifié' : 'Manuel'}</td>
                        <td className="py-2.5 text-ink-2 tabular-nums">{duration === null ? 'En cours' : `${duration} s`}</td>
                        <td className="py-2.5 text-ink-2">
                          {report.trashPurged ?? 0} purgé(s) · {report.uploadsAborted ?? 0} fermé(s) · {report.webhooksRetried ?? 0} relance(s)
                        </td>
                        <td className="py-2.5 pr-5">
                          {failed ? (
                            <span title={run.error ?? report.errors?.[0]}>
                              <Badge tone="danger">Erreur</Badge>
                            </span>
                          ) : report.incomplete ? (
                            <Badge tone="warning">Partiel</Badge>
                          ) : run.finishedAt ? (
                            <Badge tone="success">Terminé</Badge>
                          ) : (
                            <Badge>En cours</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="animate-rise stagger-4">
            <CardHeader title="Webhooks en échec" icon={<Webhook />} description="Sept derniers jours, tous projets." />
            {state.failures.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-ink-2">Aucun envoi en échec.</p>
            ) : (
              <ul className="px-5 pb-4">
                {state.failures.map((delivery) => (
                  <li key={delivery.id} className="border-t border-line py-2.5 first:border-0">
                    <p className="flex items-center gap-2 text-[0.84rem] text-ink">
                      <span className="truncate">{delivery.webhook.project.name}</span>
                      <span className="text-muted">·</span>
                      <code className="font-mono text-[0.75rem] text-ink-2">{delivery.event}</code>
                      <span className="ml-auto shrink-0 text-xs text-muted">{formatRelative(delivery.createdAt)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-2" title={delivery.webhook.url}>
                      {delivery.statusCode ? `HTTP ${delivery.statusCode}` : delivery.error ?? 'Sans réponse'} · tentative {delivery.attempt}
                      {delivery.nextAttemptAt ? `, relance ${formatRelative(delivery.nextAttemptAt)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="animate-rise stagger-5">
            <CardHeader title="Configuration" icon={<Gauge />} />
            <dl className="space-y-3 px-5 pb-5 text-[0.84rem]">
              <ConfigRow icon={Gauge} label="Limitation de débit" value={state.config.rateLimit === 'redis' ? 'Partagée (Redis)' : 'Par instance (mémoire)'} good={state.config.rateLimit === 'redis'} />
              <ConfigRow icon={Timer} label="Tâche planifiée" value={state.config.cron ? 'Secret configuré' : 'CRON_SECRET absent'} good={state.config.cron} />
              <ConfigRow
                icon={Mail}
                label="Envoi de courriels"
                value={!state.config.mail.configured ? 'Non configuré' : state.config.mail.ok ? 'SMTP joignable' : 'SMTP en erreur'}
                good={state.config.mail.ok}
              />
              <ConfigRow icon={MapPin} label="Région d’exécution" value={state.config.region ?? 'Locale'} good />
            </dl>
            <div className="space-y-2 border-t border-line px-5 py-4">
              <p className="truncate text-xs text-ink-2" title={state.config.mail.detail}>
                {state.config.mail.detail}
              </p>
              <TestEmailButton disabled={!state.config.mail.ok} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ConfigRow({ icon: Icon, label, value, good }: { icon: typeof Activity; label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-muted" />
      <dt className="flex-1 text-ink-2">{label}</dt>
      <dd className={good ? 'text-ink' : 'text-warning'}>{value}</dd>
    </div>
  )
}
