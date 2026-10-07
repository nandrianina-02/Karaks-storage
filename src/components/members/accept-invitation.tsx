'use client'

import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { selectProject } from '@/app/(app)/actions'
import { Button } from '@/components/ui/button'
import { api, errorMessage } from '@/lib/client/api'

export function AcceptInvitationButton({ token }: { token: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      const { project } = await api<{ project: { id: string } }>(`/api/v1/invitations/${token}/accept`, { method: 'POST' })
      // Le projet rejoint devient le projet courant : c'est lui qu'on vient voir.
      await selectProject(project.id)
      router.push('/dashboard')
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="primary" size="lg" loading={busy} icon={<Check className="h-[18px] w-[18px]" />} onClick={accept}>
        Accepter l’invitation
      </Button>
      {error && (
        <p role="alert" className="animate-fade rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
