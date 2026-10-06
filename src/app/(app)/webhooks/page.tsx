import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { WebhooksManager } from '@/components/webhooks/webhooks-manager'
import { webhookDto } from '@/lib/api/serialize'
import { prisma } from '@/lib/prisma'
import { WEBHOOK_EVENT_LABELS, WEBHOOK_EVENTS } from '@/lib/services/webhooks'
import { requireProject } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Webhooks' }

export default async function WebhooksPage() {
  const workspace = await requireProject()
  if (!workspace.can('webhooks:manage')) redirect('/dashboard')
  const hooks = await prisma.webhook.findMany({
    where: { projectId: workspace.project.id },
    include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { createdAt: 'desc' },
  })
  return (
    <WebhooksManager
      project={workspace.project.publicId}
      hooks={hooks.map(webhookDto)}
      events={WEBHOOK_EVENTS.map((value) => ({ value, label: WEBHOOK_EVENT_LABELS[value] }))}
    />
  )
}
