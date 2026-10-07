import { BellOff, CircleCheck, ShieldAlert } from 'lucide-react'
import type { Metadata } from 'next'

import { PublicShell } from '@/components/marketing/public-shell'
import { Button, LinkButton } from '@/components/ui/button'
import { param, type SearchParams } from '@/lib/pages'
import { EMAIL_CATEGORIES, verifyUnsubscribe } from '@/lib/services/email-notifications'
import { getSessionUser } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Se désabonner', robots: { index: false } }

/**
 * Lien de désabonnement des emails. Un bouton plutôt qu'un désabonnement à
 * l'ouverture : les antivirus de messagerie ouvrent les liens pour les
 * analyser, et désabonneraient la personne sans qu'elle ait rien demandé.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const [userId, category, signature, done] = ['u', 'c', 's', 'fait'].map((name) => param(params, name) ?? '')
  const valid = verifyUnsubscribe(userId, category, signature)
  const user = await getSessionUser()
  const query = new URLSearchParams({ u: userId, c: category, s: signature }).toString()

  return (
    <PublicShell signedIn={Boolean(user)}>
      <section className="animate-rise mx-auto max-w-xl px-4 py-14 sm:px-6">
        {!valid ? (
          <>
            <ShieldAlert className="h-7 w-7 text-ink-2" />
            <h1 className="mt-4 font-display text-[1.7rem] font-semibold text-ink">Lien de désabonnement non valide</h1>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">
              Le lien est incomplet ou ne correspond à aucun compte. Vos préférences se règlent aussi depuis votre profil.
            </p>
            <LinkButton href="/profil#emails" className="mt-6">
              Mes préférences d’emails
            </LinkButton>
          </>
        ) : done === '1' ? (
          <>
            <CircleCheck className="h-7 w-7 text-success" />
            <h1 className="mt-4 font-display text-[1.7rem] font-semibold text-ink">C’est noté</h1>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">
              Vous ne recevrez plus les emails « {EMAIL_CATEGORIES[category].label} ». Les alertes de sécurité de votre compte continuent d’arriver.
            </p>
            <LinkButton href="/profil#emails" className="mt-6">
              Revoir mes préférences
            </LinkButton>
          </>
        ) : (
          <>
            <BellOff className="h-7 w-7 text-ink-2" />
            <h1 className="mt-4 font-display text-[1.7rem] font-semibold text-ink">Ne plus recevoir ces emails ?</h1>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">
              Catégorie : <strong className="font-medium text-ink">{EMAIL_CATEGORIES[category].label}</strong> — {EMAIL_CATEGORIES[category].description}
            </p>
            <form method="post" action={`/api/v1/notifications/unsubscribe?${query}`} className="mt-6 flex flex-wrap gap-3">
              <input type="hidden" name="confirmer" value="1" />
              <Button type="submit" variant="primary" icon={<BellOff className="h-4 w-4" />}>
                Me désabonner
              </Button>
              <LinkButton href="/profil#emails">Choisir dans mon profil</LinkButton>
            </form>
          </>
        )}
      </section>
    </PublicShell>
  )
}
