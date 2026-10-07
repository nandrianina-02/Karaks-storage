'use client'

import { Send } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { api, errorMessage } from '@/lib/client/api'

/** Envoie un email d'essai à soi-même : la seule preuve que la chaîne marche jusqu'à la boîte. */
export function TestEmailButton({ disabled }: { disabled: boolean }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function send() {
    setBusy(true)
    try {
      const { sentTo } = await api<{ sentTo: string }>('/api/v1/notifications/test', { method: 'POST' })
      toast.success('Email d’essai envoyé', `Vérifiez la boîte ${sentTo}, et le dossier Spam la première fois.`)
    } catch (error) {
      toast.error('Envoi impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button size="sm" className="w-full" icon={<Send className="h-3.5 w-3.5" />} loading={busy} disabled={disabled} onClick={send}>
      Envoyer un email d’essai
    </Button>
  )
}
