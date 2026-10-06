import { HardDrive, Layers, Palette, Users, UsersRound } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import {
  AppearanceSettings,
  MembersForm,
  ProjectSettingsForm,
  StorageSettings,
  UsersAdmin,
  type ProviderRow,
} from '@/components/settings/settings-forms'
import { Card, EmptyState, PageHeader } from '@/components/ui/surface'
import { projectDto } from '@/lib/api/serialize'
import { isGoogleConfigured } from '@/lib/env'
import { param, type SearchParams } from '@/lib/pages'
import { prisma } from '@/lib/prisma'
import { canDeleteProject } from '@/lib/services/projects'
import { providerQuota } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { getWorkspace } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Paramètres' }

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const workspace = await getWorkspace()
  const params = await searchParams
  const isSuperAdmin = workspace.user.role === 'SUPER_ADMIN'

  const tabs = [
    { id: 'projet', label: 'Projet', icon: Layers, show: Boolean(workspace.project) },
    { id: 'membres', label: 'Membres', icon: UsersRound, show: Boolean(workspace.project) },
    { id: 'stockage', label: 'Stockage', icon: HardDrive, show: isSuperAdmin },
    { id: 'comptes', label: 'Comptes', icon: Users, show: workspace.canManageUsers },
    { id: 'apparence', label: 'Apparence', icon: Palette, show: true },
  ].filter((tab) => tab.show)
  const requested = param(params, 'onglet')
  const tab = tabs.find((item) => item.id === requested)?.id ?? tabs[0].id

  let content: React.ReactNode = null
  if (tab === 'projet' && workspace.project) {
    const project = workspace.project
    const [size, keys] = await Promise.all([
      prisma.file.aggregate({ where: { projectId: project.id }, _sum: { size: true }, _count: { _all: true } }),
      prisma.apiKey.count({ where: { projectId: project.id, revokedAt: null } }),
    ])
    const role = workspace.projects.find((item) => item.id === project.publicId)?.role ?? null
    content = (
      <ProjectSettingsForm
        project={projectDto(project)}
        editable={workspace.can('project:manage')}
        deletable={canDeleteProject(workspace.user.role, role)}
        stats={{ files: size._count._all, bytes: Number(size._sum.size ?? 0), keys }}
      />
    )
  } else if (tab === 'membres' && workspace.project) {
    const members = await prisma.projectMember.findMany({
      where: { projectId: workspace.project.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    })
    content = (
      <MembersForm
        project={workspace.project.publicId}
        editable={workspace.can('project:manage')}
        members={members.map((member) => ({
          userId: member.user.id,
          name: member.user.name,
          email: member.user.email,
          role: member.role,
          since: member.createdAt.toISOString(),
        }))}
      />
    )
  } else if (tab === 'stockage') {
    const providers = await prisma.storageProvider.findMany({
      include: { _count: { select: { projects: true, files: true } } },
      orderBy: { createdAt: 'asc' },
    })
    const rows: ProviderRow[] = await Promise.all(
      providers.map(async (provider) => ({
        id: provider.id,
        kind: provider.kind,
        name: provider.name,
        status: provider.status,
        account: provider.accountEmail,
        lastError: provider.lastError,
        connectedAt: provider.connectedAt?.toISOString() ?? null,
        projects: provider._count.projects,
        files: provider._count.files,
        quota:
          provider.status === 'CONNECTED' && provider.kind === 'GOOGLE_DRIVE'
            ? await providerQuota(provider).catch(() => null)
            : null,
      })),
    )
    const drive = param(params, 'drive')
    content = (
      <StorageSettings
        providers={rows}
        googleConfigured={isGoogleConfigured}
        isSuperAdmin={isSuperAdmin}
        notice={
          drive === 'connecte'
            ? { ok: true, message: 'Google Drive est relié. Les nouveaux projets y seront stockés.' }
            : drive === 'erreur'
              ? { ok: false, message: param(params, 'message') ?? 'Google Drive n’a pas pu être relié.' }
              : null
        }
      />
    )
  } else if (tab === 'comptes') {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { memberships: true } } } })
    content = (
      <UsersAdmin
        me={workspace.user.id}
        isSuperAdmin={isSuperAdmin}
        users={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          projects: user._count.memberships,
          createdAt: user.createdAt.toISOString(),
        }))}
      />
    )
  } else if (tab === 'apparence') {
    content = <AppearanceSettings />
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres" description={workspace.project ? `Projet ${workspace.project.name} et plateforme.` : 'Plateforme et apparence.'} />
      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav className="animate-rise flex gap-1 overflow-x-auto lg:flex-col" aria-label="Sections des paramètres">
          {tabs.map((item) => (
            <Link
              key={item.id}
              href={`/parametres?onglet=${item.id}`}
              aria-current={tab === item.id ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
                tab === item.id ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">
          {content ?? (
            <Card>
              <EmptyState icon={<Layers />} title="Aucun projet" description="Cette section concerne un projet." />
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
