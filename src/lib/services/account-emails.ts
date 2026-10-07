import { sendEmail } from '@/lib/email'
import { env } from '@/lib/env'
import { describeDevice, formatWhen, renderEmail } from '@/lib/mail/template'
import { prisma } from '@/lib/prisma'
import { alertAdmins, dashboardUrl, notifyUser } from '@/lib/services/email-notifications'

/**
 * Emails liés au compte : bienvenue et confirmation d'adresse,
 * réinitialisation du mot de passe, alertes de sécurité.
 */
const ACCOUNT_REASON = 'Vous recevez cet email parce qu’un compte Karaks Storage utilise cette adresse.'

const when = (date = new Date()) => formatWhen(date, env.APP_TIMEZONE)

/**
 * Inscription par email : un seul message fait l'accueil et la
 * confirmation, plutôt que deux emails coup sur coup.
 */
export async function sendVerificationEmail(user: { email: string; name: string }, url: string) {
  const { html, text } = renderEmail({
    preheader: 'Confirmez votre adresse pour finir d’ouvrir votre compte.',
    title: `Bienvenue, ${user.name.split(' ')[0]}`,
    paragraphs: [
      'Votre compte Karaks Storage est créé. Il reste à confirmer que cette adresse est bien la vôtre : c’est elle qui recevra les alertes de sécurité et les liens de réinitialisation.',
      'Un administrateur vous ouvrira ensuite l’accès aux projets, ou vous en recevrez l’invitation.',
    ],
    action: { label: 'Confirmer mon adresse', url },
    note: 'Ce lien reste valable une heure. Si vous n’avez pas créé ce compte, ignorez ce message : sans confirmation, l’adresse n’est pas validée.',
    footer: { reason: ACCOUNT_REASON },
  })
  await sendEmail({ to: user.email, subject: 'Confirmez votre adresse Karaks Storage', html, text })
}

/** Inscription par Google : l'adresse est déjà vérifiée, l'accueil suffit. */
export async function sendWelcomeEmail(user: { email: string; name: string }) {
  const { html, text } = renderEmail({
    preheader: 'Votre compte est prêt.',
    title: `Bienvenue, ${user.name.split(' ')[0]}`,
    paragraphs: [
      'Votre compte Karaks Storage est ouvert avec votre compte Google.',
      'Un administrateur vous ouvrira l’accès aux projets, ou vous en recevrez l’invitation. Les alertes de sécurité de votre compte arriveront à cette adresse.',
    ],
    action: { label: 'Ouvrir le tableau de bord', url: dashboardUrl('/dashboard') },
    footer: { reason: ACCOUNT_REASON },
  })
  await sendEmail({ to: user.email, subject: 'Bienvenue sur Karaks Storage', html, text })
}

export async function sendPasswordResetEmail(user: { email: string; name: string }, url: string) {
  const { html, text } = renderEmail({
    preheader: 'Lien valable une heure.',
    title: 'Choisir un nouveau mot de passe',
    paragraphs: [`Bonjour ${user.name.split(' ')[0]},`, 'Une réinitialisation du mot de passe de votre compte a été demandée. Ouvrez ce lien dans l’heure pour en choisir un nouveau.'],
    action: { label: 'Choisir un mot de passe', url },
    note: 'Vous n’êtes pas à l’origine de cette demande ? Ignorez ce message : votre mot de passe reste inchangé.',
    footer: { reason: ACCOUNT_REASON },
  })
  await sendEmail({ to: user.email, subject: 'Réinitialiser votre mot de passe Karaks Storage', html, text })
}

/** Un administrateur ouvre l'accès aux projets : il doit savoir qu'un compte attend. */
export async function announceSignUp(user: { id: string; email: string; name: string }, via: 'email' | 'google') {
  await alertAdmins(
    `inscription:${user.id}`,
    () => ({
      subject: `Nouveau compte : ${user.name}`,
      preheader: `${user.email} vient de s’inscrire.`,
      title: 'Un nouveau compte attend un accès',
      paragraphs: [`${user.name} vient de créer un compte. Il ne voit aucun projet tant qu’on ne l’y a pas ajouté.`],
      details: [
        ['Nom', user.name],
        ['Adresse', user.email],
        ['Inscription', via === 'google' ? 'Compte Google' : 'Adresse et mot de passe'],
        ['Date', when()],
      ],
      action: { label: 'Voir les comptes', url: dashboardUrl('/parametres?onglet=comptes') },
    }),
  )
}

// --- Sécurité ---------------------------------------------------------------

const SECURITY_ACTION = { label: 'Vérifier mon compte', url: dashboardUrl('/profil') }

/**
 * Connexion depuis un appareil jamais vu pour ce compte. « Appareil » se lit
 * dans l'agent utilisateur : l'adresse IP change trop souvent (réseau
 * mobile) pour servir de repère sans alerter à tort.
 */
export async function notifyLoginIfNewDevice(
  userId: string,
  context: { ip: string | null; userAgent: string | null; method: 'email' | 'google'; twoFactor: boolean },
) {
  const [user, previous] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
    // L'entrée de cette connexion-ci est déjà écrite : un appareil connu en a
    // au moins deux.
    prisma.auditLog.count({ where: { userId, action: 'LOGIN', userAgent: context.userAgent, createdAt: { gt: new Date(Date.now() - 180 * 86_400_000) } } }),
  ])
  if (!user || previous >= 2) return
  // Première connexion d'un compte tout juste créé : elle suit l'inscription,
  // ce n'est pas un appareil inconnu.
  const others = await prisma.auditLog.count({ where: { userId, action: 'LOGIN' } })
  if (others <= 1 && Date.now() - user.createdAt.getTime() < 86_400_000) return

  notifyUser(userId, 'security', (recipient) => ({
    subject: 'Nouvelle connexion à votre compte Karaks Storage',
    preheader: `${describeDevice(context.userAgent)}, ${when()}`,
    title: 'Nouvelle connexion depuis un appareil inconnu',
    paragraphs: [`Bonjour ${recipient.name.split(' ')[0]},`, 'Votre compte vient d’être ouvert depuis un appareil qu’il n’avait pas encore utilisé.'],
    details: [
      ['Date', when()],
      ['Appareil', describeDevice(context.userAgent)],
      ['Adresse IP', context.ip ?? 'inconnue'],
      ['Méthode', `${context.method === 'google' ? 'Compte Google' : 'Mot de passe'}${context.twoFactor ? ' et code de double authentification' : ''}`],
    ],
    action: SECURITY_ACTION,
    note: 'C’était vous ? Rien à faire. Sinon, changez votre mot de passe tout de suite : cela ferme les autres sessions. Puis activez la double authentification.',
  }))
}

export function notifyPasswordChanged(userId: string, how: 'change' | 'reset' | 'set') {
  notifyUser(userId, 'security', (recipient) => ({
    subject: 'Votre mot de passe Karaks Storage a été modifié',
    preheader: when(),
    title: how === 'set' ? 'Un mot de passe a été ajouté à votre compte' : 'Votre mot de passe a été modifié',
    paragraphs: [
      `Bonjour ${recipient.name.split(' ')[0]},`,
      how === 'reset'
        ? 'Le mot de passe de votre compte vient d’être réinitialisé par le lien envoyé à cette adresse. Toutes les sessions ouvertes ont été fermées.'
        : how === 'set'
          ? 'Votre compte, ouvert avec Google, peut désormais aussi se connecter par mot de passe.'
          : 'Le mot de passe de votre compte vient d’être changé depuis le tableau de bord.',
    ],
    details: [['Date', when()]],
    action: SECURITY_ACTION,
    note: 'Vous n’êtes pas à l’origine de ce changement ? Demandez tout de suite un nouveau mot de passe depuis la page de connexion, et prévenez l’administrateur du service.',
  }))
}

export function notifyTwoFactorChanged(userId: string, change: 'enabled' | 'disabled' | 'codes') {
  const titles = {
    enabled: 'Double authentification activée',
    disabled: 'Double authentification désactivée',
    codes: 'Nouveaux codes de secours générés',
  }
  const texts = {
    enabled: 'Un code de votre application d’authentification sera désormais demandé à chaque connexion, en plus du mot de passe. Gardez vos codes de secours hors ligne.',
    disabled: 'Le mot de passe suffit de nouveau à ouvrir votre compte. Si ce n’était pas voulu, réactivez la double authentification depuis votre profil.',
    codes: 'Une nouvelle série de codes de secours a été générée. Les anciens codes ne fonctionnent plus.',
  }
  notifyUser(userId, 'security', (recipient) => ({
    subject: `${titles[change]} sur votre compte Karaks Storage`,
    preheader: when(),
    title: titles[change],
    paragraphs: [`Bonjour ${recipient.name.split(' ')[0]},`, texts[change]],
    details: [['Date', when()]],
    action: SECURITY_ACTION,
    note: 'Vous n’êtes pas à l’origine de ce changement ? Changez votre mot de passe tout de suite et prévenez l’administrateur du service.',
  }))
}
