import type { Metadata } from 'next'

import { ProfileForms } from '@/components/settings/profile-forms'
import { PageHeader } from '@/components/ui/surface'
import { prisma } from '@/lib/prisma'
import { getWorkspace } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Profil' }

export default async function ProfilePage() {
  const workspace = await getWorkspace()
  const [user, credential, sessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: workspace.user.id } }),
    prisma.account.findFirst({ where: { userId: workspace.user.id, providerId: 'credential' } }),
    prisma.session.count({ where: { userId: workspace.user.id, expiresAt: { gt: new Date() } } }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader title="Profil" description="Votre identité et la sécurité de votre compte." />
      <ProfileForms
        user={{
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt.toISOString(),
          twoFactorEnabled: user.twoFactorEnabled,
          emailVerified: user.emailVerified,
          emailOptOut: user.emailOptOut,
        }}
        hasPassword={Boolean(credential?.password)}
        sessions={sessions}
      />
    </div>
  )
}
