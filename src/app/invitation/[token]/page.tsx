import { Clock, LogIn, MailCheck, ShieldAlert, UserPlus } from 'lucide-react'
import type { Metadata } from 'next'

import { PublicShell } from '@/components/marketing/public-shell'
import { AcceptInvitationButton } from '@/components/members/accept-invitation'
import { ResendVerificationButton } from '@/components/settings/email-preferences'
import { LinkButton } from '@/components/ui/button'
import { isEmailEnabled } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { findInvitation, ROLE_LABELS } from '@/lib/services/members'
import { formatDate } from '@/lib/utils'
import { getSessionUser } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Invitation', robots: { index: false } }

/**
 * Arrivée par un lien d'invitation. La page ne dit rien du projet tant que le
 * jeton n'est pas reconnu : un lien inventé ne doit rien apprendre.
 */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [invitation, user] = await Promise.all([findInvitation(token), getSessionUser()])
  const here = `/invitation/${token}`

  let body: React.ReactNode
  if (!invitation) {
    body = (
      <Notice
        icon={<ShieldAlert />}
        title="Lien d’invitation non valide"
        text="Vérifiez que le lien est complet, ou demandez-en un nouveau à l’administrateur du projet."
      />
    )
  } else if (invitation.state === 'accepted') {
    body = (
      <Notice icon={<MailCheck />} title="Invitation déjà acceptée" text={`Le projet ${invitation.project.name} est accessible depuis votre tableau de bord.`}>
        <LinkButton href="/dashboard" variant="primary">
          Ouvrir le tableau de bord
        </LinkButton>
      </Notice>
    )
  } else if (invitation.state === 'expired') {
    body = (
      <Notice
        icon={<Clock />}
        title="Invitation expirée"
        text="Les invitations restent valables sept jours. Demandez-en une nouvelle à l’administrateur du projet."
      />
    )
  } else {
    const mismatch = user && user.email.toLowerCase() !== invitation.email
    const unverified =
      user && !mismatch && isEmailEnabled && !(await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } }))?.emailVerified
    body = (
      <>
        <p className="text-xs font-medium tracking-[0.25em] text-accent uppercase">Invitation</p>
        <h1 className="mt-2 font-display text-[2rem] leading-tight font-semibold text-ink">Rejoindre {invitation.project.name}</h1>
        <dl className="mt-8 divide-y divide-line border-y border-line text-[0.92rem]">
          <Row label="Invité par" value={invitation.invitedBy?.name ?? 'Un administrateur'} />
          <Row label="Adresse invitée" value={invitation.email} />
          <Row label="Rôle" value={ROLE_LABELS[invitation.role]} />
          <Row label="Valable jusqu’au" value={formatDate(invitation.expiresAt)} />
        </dl>
        <div className="mt-8">
          {!user ? (
            <div className="flex flex-wrap gap-3">
              <LinkButton
                href={`/inscription?email=${encodeURIComponent(invitation.email)}&redirect=${encodeURIComponent(here)}`}
                variant="primary"
                icon={<UserPlus className="h-4 w-4" />}
              >
                Créer mon compte
              </LinkButton>
              <LinkButton href={`/connexion?redirect=${encodeURIComponent(here)}`} icon={<LogIn className="h-4 w-4" />}>
                J’ai déjà un compte
              </LinkButton>
            </div>
          ) : mismatch ? (
            <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
              Vous êtes connecté en tant que {user.email}. Cette invitation est adressée à {invitation.email} : déconnectez-vous, puis ouvrez de
              nouveau ce lien.
            </p>
          ) : unverified ? (
            <div className="space-y-3 rounded-lg border border-line bg-surface-2 px-4 py-3.5 text-sm text-ink-2">
              <p>
                Confirmez d’abord votre adresse : ouvrez le lien de l’email de bienvenue envoyé à {user.email}. Vous reviendrez ici pour accepter
                l’invitation.
              </p>
              <ResendVerificationButton email={user.email} callbackURL={here} />
            </div>
          ) : (
            <AcceptInvitationButton token={token} />
          )}
        </div>
      </>
    )
  }

  return (
    <PublicShell signedIn={Boolean(user)}>
      <section className="animate-rise mx-auto max-w-xl px-4 py-14 sm:px-6">{body}</section>
    </PublicShell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  )
}

function Notice({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div>
      <span className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface-2 text-ink-2 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <h1 className="mt-5 font-display text-[1.7rem] font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">{text}</p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  )
}
