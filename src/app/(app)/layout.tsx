import { AppShell } from '@/components/shell/app-shell'
import { storageUsed } from '@/lib/services/stats'
import { providerQuota } from '@/lib/storage'
import { getWorkspace } from '@/lib/workspace'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getWorkspace()
  const project = workspace.project
  const used = project ? await storageUsed(project.id) : null
  // Sans quota propre au projet, la limite est celle du compte de stockage :
  // 15 Go pour un compte Google gratuit.
  const quota =
    project && project.storageQuota === null && project.provider.kind === 'GOOGLE_DRIVE'
      ? await providerQuota(project.provider).catch(() => null)
      : null
  const role = workspace.projects.find((item) => item.id === project?.publicId)?.role ?? null

  return (
    <AppShell
      user={{ name: workspace.user.name, email: workspace.user.email }}
      role={role}
      permissions={[...workspace.permissions]}
      projects={workspace.projects.map((item) => ({ id: item.id, name: item.name }))}
      current={project ? { id: project.publicId, name: project.name } : null}
      storage={
        project && used
          ? { used: used.bytes, limit: project.storageQuota !== null ? Number(project.storageQuota) : quota?.limit ?? null }
          : null
      }
    >
      {children}
    </AppShell>
  )
}
