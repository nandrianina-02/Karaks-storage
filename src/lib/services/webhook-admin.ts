import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { ApiError } from '@/lib/api/errors'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { audit, type Actor } from '@/lib/services/audit'
import { deliver, isAllowedWebhookUrl, WEBHOOK_EVENTS, type WebhookEvent } from '@/lib/services/webhooks'
import { encrypt, randomBase62 } from '@/lib/security/crypto'

/** Gestion des webhooks d'un projet (CDS 19). */
const webhookUrl = z
  .string()
  .trim()
  .url('Adresse invalide')
  .refine((value) => isAllowedWebhookUrl(value), 'Adresse refusée : une URL HTTPS publique est attendue.')

export const createWebhookInput = z.object({
  url: webhookUrl,
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'Choisissez au moins un événement'),
})

export const updateWebhookInput = z.object({
  url: webhookUrl.optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  active: z.boolean().optional(),
})

export async function createWebhook(projectId: string, input: z.infer<typeof createWebhookInput>, actor: Actor) {
  const secret = `whsec_${randomBase62(32)}`
  const hook = await prisma.webhook.create({
    data: {
      projectId,
      url: input.url,
      events: [...new Set(input.events)],
      secret: encrypt(secret, env.ENCRYPTION_KEY),
    },
  })
  await audit(actor, { action: 'CREATE_WEBHOOK', projectId, target: input.url })
  return { hook, secret }
}

export async function findWebhook(projectId: string, id: string) {
  const hook = await prisma.webhook.findFirst({ where: { id, projectId } })
  if (!hook) throw new ApiError('not_found', 'Webhook introuvable.')
  return hook
}

export async function deleteWebhook(projectId: string, id: string, actor: Actor) {
  const hook = await findWebhook(projectId, id)
  await prisma.webhook.delete({ where: { id: hook.id } })
  await audit(actor, { action: 'DELETE_WEBHOOK', projectId, target: hook.url })
}

/** Envoi d'essai, pour vérifier l'adresse et la signature côté client. */
export async function sendTestEvent(projectId: string, id: string, event: WebhookEvent = 'file.uploaded') {
  const hook = await findWebhook(projectId, id)
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
  return deliver(hook, {
    id: `evt_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    event,
    createdAt: new Date().toISOString(),
    project: project.publicId,
    data: { test: true, id: 'file_exemple', name: 'exemple.mp3', size: 8452312, mimeType: 'audio/mpeg' },
  })
}
