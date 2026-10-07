'use client'

import { Lock, Mail, MailCheck, Send } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/field'
import { Card, CardHeader } from '@/components/ui/surface'
import { useToast } from '@/components/ui/toast'
import { authClient } from '@/lib/auth-client'
import { api, errorMessage } from '@/lib/client/api'

const CATEGORIES = [
  { id: 'security', label: 'Sécurité du compte', description: 'Nouvelle connexion, mot de passe, double authentification.', locked: true, adminOnly: false },
  { id: 'projects', label: 'Projets', description: 'Ajout à un projet, changement de rôle, retrait, propriété confiée.', locked: false, adminOnly: false },
  {
    id: 'operations',
    label: 'Alertes d’exploitation',
    description: 'Stockage presque plein, fournisseur déconnecté, maintenance ou webhooks en échec, nouvelles inscriptions.',
    locked: false,
    adminOnly: true,
  },
] as const

/**
 * Préférences d'emails. Chaque case s'enregistre aussitôt : un réglage de
 * cette nature n'appelle pas de bouton « Enregistrer » qu'on oublierait.
 */
export function EmailPreferencesCard({ optOut: initial, admin }: { optOut: string[]; admin: boolean }) {
  const toast = useToast()
  const [optOut, setOptOut] = useState(initial)
  const [saving, setSaving] = useState<string | null>(null)

  async function toggle(id: string, receive: boolean) {
    const next = receive ? optOut.filter((item) => item !== id) : [...optOut, id]
    setSaving(id)
    try {
      const data = await api<{ optOut: string[] }>('/api/v1/me/email-preferences', { method: 'PATCH', body: { optOut: next } })
      setOptOut(data.optOut)
      toast.success(receive ? 'Emails réactivés' : 'Emails désactivés')
    } catch (error) {
      toast.error('Enregistrement impossible', errorMessage(error))
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card id="emails" className="animate-rise stagger-4 scroll-mt-24">
      <CardHeader title="Emails" icon={<Mail />} description="Ce que Karaks Storage vous envoie, en plus des liens que vous demandez." />
      <ul className="px-5 pb-4">
        {CATEGORIES.filter((category) => admin || !category.adminOnly).map((category) => {
          const receive = category.locked || !optOut.includes(category.id)
          return (
            <li key={category.id} className="flex items-start gap-3 border-t border-line py-3 first:border-0">
              <Checkbox
                id={`mail-${category.id}`}
                checked={receive}
                disabled={category.locked || saving === category.id}
                onChange={(event) => toggle(category.id, event.target.checked)}
                className="mt-0.5"
              />
              <label htmlFor={`mail-${category.id}`} className="min-w-0 flex-1 text-sm">
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  {category.label}
                  {category.locked && (
                    <span className="flex items-center gap-1 text-xs font-normal text-muted">
                      <Lock className="h-3 w-3" />
                      toujours envoyés
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-2">{category.description}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** Renvoi du lien de confirmation d'adresse. */
export function ResendVerificationButton({ email, size = 'sm', callbackURL = '/dashboard' }: { email: string; size?: 'sm' | 'md'; callbackURL?: string }) {
  const toast = useToast()
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')

  async function send() {
    setState('busy')
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL })
    if (error) {
      setState('idle')
      toast.error('Envoi impossible', error.status === 429 ? 'Trop de demandes : patientez quelques minutes.' : error.message)
      return
    }
    setState('sent')
    toast.success('Lien envoyé', `Consultez la boîte ${email}.`)
  }

  return (
    <Button size={size} loading={state === 'busy'} disabled={state === 'sent'} icon={state === 'sent' ? <MailCheck className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />} onClick={send}>
      {state === 'sent' ? 'Lien envoyé' : 'Renvoyer le lien'}
    </Button>
  )
}
