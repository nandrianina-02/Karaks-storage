import { createHmac } from 'node:crypto'

import { track } from '@/lib/background'
import { sendEmail } from '@/lib/email'
import { appUrl, env } from '@/lib/env'
import { renderEmail, type EmailContent } from '@/lib/mail/template'
import { prisma } from '@/lib/prisma'
import { safeEqual } from '@/lib/security/crypto'

/**
 * Emails de notification, par catégorie :
 *
 * - sécurité : connexion depuis un nouvel appareil, mot de passe changé,
 *   double authentification modifiée. Toujours envoyés : on ne laisse pas
 *   quelqu'un se priver de l'alerte qui lui signalerait un vol de compte ;
 * - projets : ajout à un projet, changement de rôle, retrait, propriété
 *   confiée. Désactivables ;
 * - exploitation : alertes aux administrateurs (stockage presque plein,
 *   fournisseur déconnecté, maintenance en échec, webhooks abandonnés,
 *   nouvelle inscription). Désactivables.
 *
 * Les envois partent en arrière-plan : une connexion ne doit pas attendre le
 * serveur SMTP.
 */
export const EMAIL_CATEGORIES = {
  security: {
    label: 'Sécurité du compte',
    description: 'Nouvelle connexion, mot de passe, double authentification.',
    optional: false,
    reason: 'Vous recevez cet email parce qu’il concerne la sécurité de votre compte Karaks Storage. Ces messages ne peuvent pas être désactivés.',
  },
  projects: {
    label: 'Projets',
    description: 'Ajout à un projet, changement de rôle, retrait, propriété confiée.',
    optional: true,
    reason: 'Vous recevez cet email parce que vous êtes membre d’un projet sur Karaks Storage.',
  },
  operations: {
    label: 'Alertes d’exploitation',
    description: 'Stockage presque plein, fournisseur déconnecté, maintenance ou webhooks en échec, nouvelles inscriptions.',
    optional: true,
    reason: 'Vous recevez cet email en tant qu’administrateur de Karaks Storage.',
  },
} as const

export type EmailCategory = keyof typeof EMAIL_CATEGORIES
export const OPTIONAL_CATEGORIES = (Object.keys(EMAIL_CATEGORIES) as EmailCategory[]).filter((key) => EMAIL_CATEGORIES[key].optional)

export function isEmailCategory(value: string): value is EmailCategory {
  return value in EMAIL_CATEGORIES
}

// --- Désabonnement sans connexion -------------------------------------------

/**
 * Signature du lien de désabonnement : il doit marcher sans connexion (un
 * clic depuis la boîte de réception), sans permettre de désabonner quelqu'un
 * d'autre en changeant l'identifiant dans l'adresse.
 */
function unsubscribeSignature(userId: string, category: string) {
  return createHmac('sha256', env.API_SECRET).update(`unsubscribe:${userId}:${category}`).digest('base64url').slice(0, 32)
}

export function unsubscribeParams(userId: string, category: EmailCategory) {
  return new URLSearchParams({ u: userId, c: category, s: unsubscribeSignature(userId, category) }).toString()
}

export function verifyUnsubscribe(userId: string, category: string, signature: string): category is EmailCategory {
  if (!isEmailCategory(category) || !EMAIL_CATEGORIES[category].optional) return false
  return safeEqual(signature, unsubscribeSignature(userId, category))
}

export async function setOptOut(userId: string, optOut: EmailCategory[]) {
  const allowed = optOut.filter((category) => EMAIL_CATEGORIES[category].optional)
  return prisma.user.update({ where: { id: userId }, data: { emailOptOut: [...new Set(allowed)] }, select: { emailOptOut: true } })
}

export async function unsubscribe(userId: string, category: EmailCategory) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailOptOut: true } })
  if (!user) return
  if (!user.emailOptOut.includes(category)) await setOptOut(userId, [...(user.emailOptOut as EmailCategory[]), category])
}

// --- Envoi --------------------------------------------------------------------

export type Notification = Omit<EmailContent, 'footer'> & { subject: string }

interface Recipient {
  id: string
  email: string
  name: string
  status: string
  emailOptOut: string[]
}

const RECIPIENT = { id: true, email: true, name: true, status: true, emailOptOut: true } as const

async function deliver(user: Recipient, category: EmailCategory, notification: Notification) {
  if (user.status !== 'ACTIVE') return { sent: false }
  if (EMAIL_CATEGORIES[category].optional && user.emailOptOut.includes(category)) return { sent: false }
  const params = EMAIL_CATEGORIES[category].optional ? unsubscribeParams(user.id, category) : null
  const { html, text } = renderEmail({
    ...notification,
    footer: { reason: EMAIL_CATEGORIES[category].reason, unsubscribeUrl: params ? `${appUrl}/desabonnement?${params}` : undefined },
  })
  return sendEmail({
    to: user.email,
    subject: notification.subject,
    html,
    text,
    // Désabonnement en un clic depuis la boîte de réception (RFC 8058) :
    // Gmail l'attend des expéditeurs d'emails non transactionnels.
    headers: params
      ? { 'List-Unsubscribe': `<${appUrl}/api/v1/notifications/unsubscribe?${params}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
      : {},
  })
}

/** Envoie à un compte, en arrière-plan. `build` reçoit le compte, pour le nommer. */
export function notifyUser(userId: string, category: EmailCategory, build: (user: Recipient) => Notification) {
  track(
    (async () => {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: RECIPIENT })
      if (user) await deliver(user, category, build(user))
    })().catch((error: unknown) => console.error('[notification]', error instanceof Error ? error.message : error)),
  )
}

/** Envoi immédiat, attendu : pour les cas où l'appelant doit savoir si c'est parti. */
export async function notifyUserNow(userId: string, category: EmailCategory, build: (user: Recipient) => Notification) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: RECIPIENT })
  if (!user) return { sent: false }
  return deliver(user, category, build(user))
}

/**
 * Alerte d'exploitation, une seule fois par situation. `key` nomme la
 * situation (« quota:projet:… »), `level` son degré : une alerte à 95 % part
 * même si celle à 80 % est déjà partie ; la même ne repart qu'après
 * `cooldownMs`, ou quand `clearAlert` l'a réarmée.
 *
 * Destinataires : les super administrateurs, et pour une alerte de projet
 * son propriétaire et ses administrateurs.
 */
export async function alertAdmins(
  key: string,
  build: (user: Recipient) => Notification,
  options: { level?: number; projectId?: string; cooldownMs?: number; superAdmins?: boolean } = {},
) {
  const level = options.level ?? 1
  const existing = await prisma.alertState.findUnique({ where: { key } })
  const cooled = !existing || (options.cooldownMs !== undefined && Date.now() - existing.sentAt.getTime() > options.cooldownMs)
  if (existing && existing.level >= level && !cooled) return false
  await prisma.alertState.upsert({ where: { key }, create: { key, level }, update: { level, sentAt: new Date() } })

  const recipients = new Map<string, Recipient>()
  if (options.superAdmins !== false) {
    for (const user of await prisma.user.findMany({ where: { role: 'SUPER_ADMIN' }, select: RECIPIENT })) recipients.set(user.id, user)
  }
  if (options.projectId) {
    const members = await prisma.projectMember.findMany({
      where: { projectId: options.projectId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { user: { select: RECIPIENT } },
    })
    for (const { user } of members) recipients.set(user.id, user)
  }
  track(
    Promise.all([...recipients.values()].map((user) => deliver(user, 'operations', build(user)))).catch((error: unknown) =>
      console.error('[alerte]', error instanceof Error ? error.message : error),
    ),
  )
  return true
}

/** La situation est revenue à la normale : la prochaine alerte repartira. */
export async function clearAlert(key: string) {
  await prisma.alertState.deleteMany({ where: { key } })
}

/** Lien absolu vers une page du tableau de bord. */
export function dashboardUrl(path: string) {
  return `${appUrl}${path.startsWith('/') ? path : `/${path}`}`
}
