import type { Metadata } from 'next'

import { PublicShell } from '@/components/marketing/public-shell'
import { LEVELS, OVERALL } from '@/components/supervision/level'
import { publicStatus } from '@/lib/services/health'
import { cn } from '@/lib/utils'
import { getSessionUser } from '@/lib/workspace'

export const metadata: Metadata = {
  title: 'Statut du service',
  description: 'État en direct de Karaks Storage : API, stockage et liens temporaires.',
}

// Toujours relue : une page de statut figée au moment du déploiement
// mentirait précisément quand on la consulte.
export const dynamic = 'force-dynamic'

const TONE = { success: 'text-success', warning: 'text-warning', danger: 'text-danger' }

export default async function StatusPage() {
  const [status, user] = await Promise.all([publicStatus(), getSessionUser()])
  const overall = LEVELS[status.level]
  const OverallIcon = overall.icon

  return (
    <PublicShell signedIn={Boolean(user)}>
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <p className="animate-rise text-xs font-medium tracking-[0.25em] text-accent uppercase">Karaks Storage</p>
        <h1 className="animate-rise stagger-1 mt-2 font-display text-[2.1rem] leading-tight font-semibold text-ink">Statut du service</h1>

        <div className="animate-rise stagger-2 mt-8 flex items-center gap-3 border-y border-line py-5">
          <OverallIcon className={cn('h-6 w-6 shrink-0', TONE[overall.tone])} />
          <p className="text-lg text-ink">{OVERALL[status.level]}</p>
        </div>

        <ul className="animate-rise stagger-3">
          {status.components.map((component) => {
            const level = LEVELS[component.level]
            const Icon = level.icon
            return (
              <li key={component.id} className="flex items-center gap-3 border-b border-line py-4">
                <span className="flex-1 text-[0.95rem] text-ink">{component.label}</span>
                <span className={cn('flex items-center gap-1.5 text-sm', TONE[level.tone])}>
                  <Icon className="h-4 w-4" />
                  {level.label}
                </span>
              </li>
            )
          })}
        </ul>

        <p className="animate-fade stagger-4 mt-6 text-sm text-muted">
          Vérifié le{' '}
          <time dateTime={status.checkedAt}>
            {new Date(status.checkedAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })}
          </time>{' '}
          (heure de Paris). Les applications peuvent lire cet état par <code className="font-mono text-[0.85em] text-ink-2">GET /api/v1/status</code>.
        </p>
      </section>
    </PublicShell>
  )
}
