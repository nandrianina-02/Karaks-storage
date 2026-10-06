import { randomUUID } from 'node:crypto'

import type { Prisma } from '@/generated/prisma/client'

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
  void deliverAll(projectId, event, data).catch((error) => {
    console.error('[webhooks]', error instanceof Error ? error.message : error)
  })
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

export async function deliver(
  hook: { id: string; url: string; secret: string },
  payload: { id: string; event: string; createdAt: string; project: string; data: Record<string, unknown> },
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
    },
  })
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
