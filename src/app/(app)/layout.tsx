import { ShieldAlert } from 'lucide-react'

import { ResendVerificationButton } from '@/components/settings/email-preferences'
import { AppShell } from '@/components/shell/app-shell'
import { isEmailEnabled } from '@/lib/env'
import { prisma } from '@/lib/prisma'
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
  // Rappel tant que l'adresse n'est pas confirmée, si un lien peut lui parvenir.
  const unverified =
    isEmailEnabled && !(await prisma.user.findUnique({ where: { id: workspace.user.id }, select: { emailVerified: true } }))?.emailVerified

  return (
    <AppShell
      user={{ name: workspace.user.name, email: workspace.user.email }}
      role={role}
      permissions={[...workspace.permissions]}
      superAdmin={workspace.user.role === 'SUPER_ADMIN'}
      projects={workspace.projects.map((item) => ({ id: item.id, name: item.name }))}
      current={project ? { id: project.publicId, name: project.name } : null}
      storage={
        project && used
          ? { used: used.bytes, limit: project.storageQuota !== null ? Number(project.storageQuota) : quota?.limit ?? null }
          : null
      }
    >
      {unverified && (
        <div className="animate-fade mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-ink">
          <ShieldAlert className="h-5 w-5 shrink-0 text-warning" />
          <span className="min-w-0 flex-1">
            <strong className="font-medium">Confirmez votre adresse {workspace.user.email}.</strong> Le lien est dans l’email de bienvenue ; sans
            confirmation, vous ne pouvez pas accepter d’invitation à un projet.
          </span>
          <ResendVerificationButton email={workspace.user.email} />
        </div>
      )}
      {children}
    </AppShell>
  )
}
