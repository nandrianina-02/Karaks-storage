import type { ReactNode } from 'react'

import { PublicShell } from '@/components/marketing/public-shell'

/** Page juridique : colonne de lecture, sommaire implicite par les titres. */
export function LegalPage({
  title,
  updated,
  intro,
  signedIn,
  children,
}: {
  title: string
  updated: string
  intro: ReactNode
  signedIn: boolean
  children: ReactNode
}) {
  return (
    <PublicShell signedIn={signedIn}>
      <article className="animate-rise mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <p className="text-xs font-medium tracking-[0.25em] text-accent uppercase">Karaks Storage</p>
        <h1 className="mt-2 font-display text-[2.1rem] leading-tight font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-muted">Mise à jour : {updated}</p>
        <div className="mt-6 text-[0.95rem] leading-relaxed text-ink-2">{intro}</div>
        <div className="mt-10 space-y-9 text-[0.95rem] leading-relaxed text-ink-2 [&_a]:text-accent [&_a]:underline [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-1.5 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </article>
    </PublicShell>
  )
}

/** Adresse de contact affichée sur les pages juridiques. */
export const CONTACT_EMAIL = 'todisoa.razafindrakoto.nd@gmail.com'
