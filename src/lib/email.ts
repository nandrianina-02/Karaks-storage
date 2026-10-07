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

function transport() {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    // Une fonction serverless ne doit pas attendre une minute un serveur muet.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  return transporter
}

/**
 * Expéditeur effectif. Gmail remplace toute adresse qui n'est pas celle du
 * compte connecté (ou un alias vérifié) : plutôt que de le laisser réécrire
 * en silence, on garde le nom affiché de MAIL_FROM avec l'adresse du compte.
 * Avec un domaine à soi et un autre prestataire, MAIL_FROM passe tel quel.
 */
export function senderAddress(): string {
  const match = env.MAIL_FROM.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  const name = (match?.[1] ?? '').trim() || 'Karaks Storage'
  const address = match?.[2] ?? env.MAIL_FROM.trim()
  const gmail = /(^|\.)(gmail|googlemail)\.com$/i.test(env.SMTP_HOST ?? '')
  if (gmail && env.SMTP_USER && address.toLowerCase() !== env.SMTP_USER.toLowerCase()) {
    return `"${name}" <${env.SMTP_USER}>`
  }
  return `"${name}" <${address}>`
}

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html?: string
  headers?: Record<string, string>
}

export async function sendEmail(message: EmailMessage): Promise<{ sent: boolean; error?: string }> {
  if (!isEmailEnabled) {
    console.info(`[email] SMTP non configuré. Destinataire : ${message.to}\n  ${message.subject}\n${message.text}`)
    return { sent: false }
  }
  try {
    await transport().sendMail({ from: senderAddress(), ...message })
    return { sent: true }
  } catch (error) {
    // Jamais renvoyé au client : un formulaire de mot de passe oublié ne doit
    // révéler ni l'existence d'une adresse, ni la raison d'un échec.
    console.error('[email]', error instanceof Error ? error.message : error)
    return { sent: false, error: error instanceof Error ? error.message : 'Échec de l’envoi' }
  }
}

/** État du serveur SMTP, gardé dix minutes : la supervision le relit souvent. */
let lastCheck: { at: number; ok: boolean; detail: string } | null = null

export async function checkEmail(force = false): Promise<{ configured: boolean; ok: boolean; detail: string }> {
  if (!isEmailEnabled) return { configured: false, ok: false, detail: 'SMTP_HOST absent : les emails sont écrits dans le journal du serveur.' }
  if (!force && lastCheck && Date.now() - lastCheck.at < 10 * 60_000) return { configured: true, ok: lastCheck.ok, detail: lastCheck.detail }
  try {
    await transport().verify()
    lastCheck = { at: Date.now(), ok: true, detail: `${env.SMTP_HOST}:${env.SMTP_PORT}, expéditeur ${senderAddress()}` }
  } catch (error) {
    lastCheck = { at: Date.now(), ok: false, detail: error instanceof Error ? error.message : 'Le serveur SMTP ne répond pas.' }
  }
  return { configured: true, ok: lastCheck.ok, detail: lastCheck.detail }
}
