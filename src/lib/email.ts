import nodemailer, { type Transporter } from 'nodemailer'

import { env, isEmailEnabled } from '@/lib/env'

/**
 * Courriels transactionnels, par SMTP : tous les prestataires l'acceptent, et
 * le choix du prestataire reste une décision d'exploitation.
 *
 * Sans serveur configuré, le message est écrit dans le journal du serveur :
 * c'est ainsi qu'on récupère un lien de réinitialisation en développement.
 */
let transporter: Transporter | null = null

export async function sendEmail(message: { to: string; subject: string; text: string }) {
  if (!isEmailEnabled) {
    console.info(`[email] SMTP non configuré. Destinataire : ${message.to}\n  ${message.subject}\n${message.text}`)
    return { sent: false }
  }
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  })
  try {
    await transporter.sendMail({ from: env.MAIL_FROM, ...message })
    return { sent: true }
  } catch (error) {
    // Jamais renvoyé au client : un formulaire de mot de passe oublié ne doit
    // révéler ni l'existence d'une adresse, ni la raison d'un échec.
    console.error('[email]', error instanceof Error ? error.message : error)
    return { sent: false }
  }
}
