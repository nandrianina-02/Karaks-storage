import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ApiKeysManager } from '@/components/keys/api-keys-manager'
import { apiKeyDto } from '@/lib/api/serialize'
import { prisma } from '@/lib/prisma'
import { requireProject } from '@/lib/workspace'

export const metadata: Metadata = { title: 'API Keys' }

export default async function ApiKeysPage() {
  const workspace = await requireProject()
  if (!workspace.can('api-keys:manage')) redirect('/dashboard')
  const keys = await prisma.apiKey.findMany({ where: { projectId: workspace.project.id }, orderBy: { createdAt: 'desc' } })
  return <ApiKeysManager project={workspace.project.publicId} keys={keys.map(apiKeyDto)} />
}
