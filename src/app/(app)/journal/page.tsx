import { ArrowLeft, ArrowRight, KeyRound, Link2, ScrollText, UserRound } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ACTION_ICONS } from '@/components/dashboard/activity-list'
import { LogsFilters } from '@/components/logs/logs-filters'
import { buttonClass } from '@/components/ui/button'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/surface'
import type { AuditAction } from '@/generated/prisma/client'
import { param, type SearchParams } from '@/lib/pages'
import { AUDIT_LABELS } from '@/lib/services/audit'
import { listLogs } from '@/lib/services/logs'
import { cn, formatDate } from '@/lib/utils'
import { requireProject } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Logs' }

const LIMIT = 50

/** Journal d'audit (CDS 23) : qui, quoi, sur quel fichier, avec quel résultat, d'où. */
export default async function LogsPage({ searchParams }: { searchParams: SearchParams }) {
  const workspace = await requireProject()
  if (!workspace.can('logs:read')) redirect('/dashboard')
  const params = await searchParams

  const action = param(params, 'action')
  const result = param(params, 'resultat')
  const page = Math.max(1, Number(param(params, 'page')) || 1)
  const logs = await listLogs(workspace.project.id, {
    action: action && action in AUDIT_LABELS ? (action as AuditAction) : undefined,
    result: result === 'SUCCESS' || result === 'FAILURE' ? result : undefined,
    search: param(params, 'q')?.slice(0, 120) || undefined,
    page,
    limit: LIMIT,
  })

  const pageHref = (target: number) => {
    const next = new URLSearchParams(Object.entries(params).flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : [])))
    next.set('page', String(target))
    return `/journal?${next}`
  }
  const last = Math.max(1, Math.ceil(logs.total / LIMIT))

  return (
    <div className="space-y-5">
      <PageHeader title="Logs" description="Toutes les opérations sensibles du projet : téléversements, lectures, liens, clés, suppressions." />
      <LogsFilters actions={Object.entries(AUDIT_LABELS).map(([value, label]) => ({ value, label }))} />

      <Card className="animate-rise stagger-1">
        {logs.items.length === 0 ? (
          <EmptyState icon={<ScrollText />} title="Aucune entrée" description="Rien ne correspond à ces filtres." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[0.84rem]">
              <thead>
                <tr className="border-b border-line text-[0.78rem] text-ink-2">
                  <th className="py-3 pl-5 font-medium">Date</th>
                  <th className="py-3 font-medium">Action</th>
                  <th className="py-3 font-medium">Cible</th>
                  <th className="py-3 font-medium">Auteur</th>
                  <th className="py-3 font-medium">Adresse IP</th>
                  <th className="py-3 pr-5 font-medium">Résultat</th>
                </tr>
              </thead>
              <tbody>
                {logs.items.map((item, index) => {
                  const Icon = ACTION_ICONS[item.action] ?? ScrollText
                  const ActorIcon = item.actorKind === 'user' ? UserRound : item.actorKind === 'apiKey' ? KeyRound : Link2
                  return (
                    <tr key={item.id} className={cn('animate-fade border-b border-line last:border-b-0', `stagger-${Math.min(index + 1, 6)}`)}>
                      <td className="py-2.5 pl-5 whitespace-nowrap text-ink-2 tabular-nums">{formatDate(item.createdAt)}</td>
                      <td className="py-2.5">
                        <span className="flex items-center gap-2 text-ink">
                          <Icon className="h-4 w-4 text-ink-2" />
                          {item.label}
                        </span>
                      </td>
                      <td className="max-w-64 py-2.5">
                        {item.fileId ? (
                          <Link href={`/fichiers/${item.fileId}`} className="block truncate text-ink hover:underline" title={item.target ?? undefined}>
                            {item.target ?? item.fileId}
                          </Link>
                        ) : (
                          <span className="block truncate text-ink-2">{item.target ?? '—'}</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <span className="flex items-center gap-1.5 text-ink-2">
                          <ActorIcon className="h-3.5 w-3.5" />
                          <span className="max-w-44 truncate">{item.actor}</span>
                        </span>
                      </td>
                      <td className="py-2.5 font-mono text-[0.76rem] text-muted">{item.ip ?? '—'}</td>
                      <td className="py-2.5 pr-5">
                        <Badge tone={item.result === 'SUCCESS' ? 'success' : 'danger'}>{item.result === 'SUCCESS' ? 'Réussi' : 'Échec'}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[0.8rem] text-ink-2">
          <span className="tabular-nums">
            {logs.total} entrée{logs.total > 1 ? 's' : ''} · page {page} sur {last}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className={buttonClass('secondary', 'sm')}>
                <ArrowLeft className="h-3.5 w-3.5" />
                Précédent
              </Link>
            ) : null}
            {page < last ? (
              <Link href={pageHref(page + 1)} className={buttonClass('secondary', 'sm')}>
                Suivant
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  )
}
