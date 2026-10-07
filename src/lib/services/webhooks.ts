import { randomUUID } from 'node:crypto'

import type { Prisma } from '@/generated/prisma/client'
import { track } from '@/lib/background'

import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { decrypt, signPayload } from '@/lib/security/crypto'

/**
 * Webhooks (CDS 19).
 *
 * Chaque envoi est signé : l'en-tête `Karaks-Signature` porte l'horodatage et
 * un HMAC-SHA-256 de `<horodatage>.<corps>` calculé avec le secret du
 * webhook. Le client recalcule la signature et refuse un écart de plus de
 * cinq minutes, ce qui écarte aussi le rejeu d'un ancien envoi.
 *
 * L'envoi part en arrière-plan : l'opération qui le déclenche ne doit pas
 * attendre un serveur tiers, ni échouer parce qu'il est lent ou en panne.
 */
export const WEBHOOK_EVENTS = [
  'file.uploaded',
  'file.updated',
  'file.deleted',
  'file.restored',
  'file.streamed',
  'file.downloaded',
  'link.created',
  'link.expired',
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  'file.uploaded': 'Fichier téléversé',
  'file.updated': 'Fichier modifié',
  'file.deleted': 'Fichier supprimé',
  'file.restored': 'Fichier restauré',
  'file.streamed': 'Lecture démarrée',
  'file.downloaded': 'Fichier téléchargé',
  'link.created': 'Lien temporaire créé',
  'link.expired': 'Lien temporaire expiré',
}

const TIMEOUT_MS = 10_000

export function emit(projectId: string, event: WebhookEvent, data: Record<string, unknown>) {
  track(
    deliverAll(projectId, event, data).catch((error) => {
      console.error('[webhooks]', error instanceof Error ? error.message : error)
    }),
  )
}

async function deliverAll(projectId: string, event: WebhookEvent, data: Record<string, unknown>) {
  const hooks = await prisma.webhook.findMany({
    where: { projectId, active: true, events: { has: event } },
    include: { project: { select: { publicId: true } } },
  })
  await Promise.all(
    hooks.map((hook) =>
      deliver(hook, {
        id: `evt_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
        event,
        createdAt: new Date().toISOString(),
        project: hook.project.publicId,
        data,
      }),
    ),
  )
}

/**
 * Délais avant chaque nouvel essai d'un envoi en échec : un serveur
 * momentanément en panne a le temps de revenir, sans être harcelé. Au-delà de
 * la cinquième tentative, l'envoi est abandonné et reste visible dans
 * l'historique.
 */
export const RETRY_DELAYS_MS = [60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000]
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1

export type WebhookPayload = { id: string; event: string; createdAt: string; project: string; data: Record<string, unknown> }

export async function deliver(
  hook: { id: string; url: string; secret: string },
  payload: WebhookPayload,
  attempt = 1,
  /** Faux pour un envoi d'essai : on ne relance pas un essai. */
  retry = true,
) {
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = signPayload(body, decrypt(hook.secret, env.ENCRYPTION_KEY), timestamp)
  const started = Date.now()

  let statusCode: number | null = null
  let error: string | null = null
  try {
    const response = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'KaraksStorage-Webhooks/1.0',
        'Karaks-Event': payload.event,
        'Karaks-Delivery': payload.id,
        'Karaks-Signature': `t=${timestamp},v1=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'manual',
    })
    statusCode = response.status
    if (!response.ok) error = `Réponse ${response.status}`
  } catch (caught) {
    error =
      caught instanceof Error && caught.name === 'TimeoutError'
        ? `Aucune réponse en ${TIMEOUT_MS / 1000} s`
        : 'Serveur injoignable'
  }

  await prisma.webhookDelivery.create({
    data: {
      webhookId: hook.id,
      event: payload.event,
      payload: payload as unknown as Prisma.InputJsonValue,
      statusCode,
      success: error === null,
      error,
      durationMs: Date.now() - started,
      attempt,
      // Même identifiant d'événement à chaque essai : le destinataire peut
      // écarter un doublon s'il avait reçu l'envoi sans pouvoir répondre.
      nextAttemptAt: retry && error !== null && attempt < MAX_ATTEMPTS ? new Date(Date.now() + RETRY_DELAYS_MS[attempt - 1]) : null,
    },
  })
  if (retry && error !== null && attempt >= MAX_ATTEMPTS) {
    const failure = error
    const hookRow = await prisma.webhook.findUnique({ where: { id: hook.id }, select: { id: true, url: true, projectId: true } })
    if (hookRow) {
      const { alertWebhookAbandoned } = await import('@/lib/services/alerts')
      await alertWebhookAbandoned(hookRow, payload.event, failure).catch(() => undefined)
    }
  }
  return { success: error === null, statusCode, error }
}

/**
 * Un webhook ne doit pas viser le réseau interne du serveur : sans ce
 * contrôle, un compte pourrait faire interroger par le service une adresse
 * qu'il n'atteint pas lui-même (SSRF). En production, seules les adresses
 * HTTPS publiques sont acceptées.
 */
export function isAllowedWebhookUrl(raw: string, production = process.env.NODE_ENV === 'production'): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.username || url.password) return false
  if (production && url.protocol !== 'https:') return false
  if (!['https:', 'http:'].includes(url.protocol)) return false
  if (!production) return true

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    return false
  }
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host)) return false
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return false
  return true
}

/**
 * Relance les envois dont l'heure est venue. Chaque envoi est d'abord
 * « réclamé » par une mise à jour conditionnelle : deux instances qui
 * passeraient en même temps ne le renverraient pas deux fois.
 */
export async function retryDueDeliveries(limit = 20): Promise<number> {
  const due = await prisma.webhookDelivery.findMany({
    where: { success: false, nextAttemptAt: { lte: new Date() } },
    include: { webhook: true },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
  })
  let retried = 0
  for (const delivery of due) {
    const claimed = await prisma.webhookDelivery.updateMany({
      where: { id: delivery.id, nextAttemptAt: { not: null } },
      data: { nextAttemptAt: null },
    })
    if (claimed.count === 0 || !delivery.webhook.active) continue
    await deliver(delivery.webhook, delivery.payload as unknown as WebhookPayload, delivery.attempt + 1)
    retried += 1
  }
  return retried
}
