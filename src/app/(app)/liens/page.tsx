import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { LinksManager } from '@/components/links/links-manager'
import { linkDto, type LinkStatus } from '@/lib/api/serialize'
import { param, type SearchParams } from '@/lib/pages'
import { listLinks } from '@/lib/services/links'
import { requireProject } from '@/lib/workspace'

export const metadata: Metadata = { title: 'URLs temporaires' }

const STATUSES = ['active', 'expired', 'revoked', 'exhausted'] as const

export default async function LinksPage({ searchParams }: { searchParams: SearchParams }) {
  const workspace = await requireProject()
  if (!workspace.can('files:read')) redirect('/dashboard')
  const requested = param(await searchParams, 'statut')
  const status: LinkStatus | 'all' = STATUSES.includes(requested as LinkStatus) ? (requested as LinkStatus) : 'all'
  const result = await listLinks(workspace.project.id, { status, page: 1, limit: 100 })

  return (
    <LinksManager
      project={workspace.project.publicId}
      links={result.items.map(linkDto)}
      status={status}
      canCreate={workspace.can('links:create')}
      canRevoke={workspace.can('links:revoke')}
    />
  )
}
