'use client'

import { Wrench } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { api, errorMessage } from '@/lib/client/api'

interface Report {
  trashPurged: number
  uploadsAborted: number
  webhooksRetried: number
  deliveriesPruned: number
  incomplete: boolean
  errors: string[]
}

/** Lance un passage de maintenance sans attendre la nuit. */
export function RunMaintenanceButton() {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  async function run() {
    setBusy(true)
    try {
      const { report } = await api<{ report: Report }>('/api/cron/maintenance')
      const summary = `${report.trashPurged} fichier(s) purgé(s), ${report.uploadsAborted} envoi(s) fermé(s), ${report.webhooksRetried} webhook(s) relancé(s)`
      if (report.errors.length > 0) toast.error('Maintenance terminée avec des erreurs', report.errors[0])
      else toast.success(report.incomplete ? 'Maintenance partielle, la suite au prochain passage' : 'Maintenance terminée', summary)
      startTransition(() => router.refresh())
    } catch (error) {
      toast.error('Maintenance impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="primary" icon={<Wrench className="h-4 w-4" />} loading={busy} onClick={run}>
      Lancer la maintenance
    </Button>
  )
}
