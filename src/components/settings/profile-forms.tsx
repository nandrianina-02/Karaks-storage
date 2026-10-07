'use client'

import { KeyRound, LogOut, Save, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Badge, Card, CardHeader } from '@/components/ui/surface'
import { useToast } from '@/components/ui/toast'
import { TwoFactorCard } from '@/components/settings/two-factor-card'
import { authClient } from '@/lib/auth-client'
import { formatDate, initials } from '@/lib/utils'

const ROLES: Record<string, string> = {
  SUPER_ADMIN: 'Super administrateur',
  ADMIN: 'Administrateur',
  DEVELOPER: 'Développeur',
  USER: 'Utilisateur',
  SERVICE: 'Compte de service',
}

export function ProfileForms({
  user,
  hasPassword,
  sessions,
}: {
  user: { name: string; email: string; role: string; createdAt: string; twoFactorEnabled: boolean }
  hasPassword: boolean
  sessions: number
}) {
  const router = useRouter()
  const toast = useToast()
  const [name, setName] = useState(user.name)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function saveName(event: React.FormEvent) {
    event.preventDefault()
    setBusy('name')
    const { error } = await authClient.updateUser({ name })
    setBusy(null)
    if (error) return toast.error('Enregistrement impossible', error.message)
    toast.success('Nom mis à jour')
    router.refresh()
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault()
    setBusy('password')
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true })
    setBusy(null)
    if (error) {
      return toast.error('Mot de passe inchangé', error.code === 'INVALID_PASSWORD' ? 'Le mot de passe actuel est incorrect.' : error.message)
    }
    setCurrent('')
    setNext('')
    toast.success('Mot de passe modifié', 'Vos autres sessions ont été fermées.')
  }

  async function signOutOthers() {
    setBusy('sessions')
    const { error } = await authClient.revokeOtherSessions()
    setBusy(null)
    if (error) return toast.error('Opération impossible', error.message)
    toast.success('Autres sessions fermées')
    router.refresh()
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-5">
        <Card className="animate-rise stagger-1">
          <CardHeader title="Identité" icon={<UserRound />} />
          <form onSubmit={saveName} className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
            <Field label="Nom affiché" htmlFor="p-name">
              <Input id="p-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
            </Field>
            <Field label="Adresse email" htmlFor="p-email" hint="Elle sert d’identifiant de connexion.">
              <Input id="p-email" value={user.email} readOnly className="text-ink-2" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" loading={busy === 'name'} disabled={name.trim() === user.name} icon={<Save className="h-4 w-4" />}>
                Enregistrer
              </Button>
            </div>
          </form>
        </Card>

        {hasPassword && (
          <Card className="animate-rise stagger-2">
            <CardHeader title="Mot de passe" icon={<KeyRound />} description="Le changer ferme vos autres sessions." />
            <form onSubmit={changePassword} className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <Field label="Mot de passe actuel" htmlFor="p-current">
                <Input id="p-current" type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" required />
              </Field>
              <Field label="Nouveau mot de passe" htmlFor="p-next" hint="10 caractères au moins.">
                <Input id="p-next" type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" minLength={10} required />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" variant="primary" loading={busy === 'password'}>
                  Changer le mot de passe
                </Button>
              </div>
            </form>
          </Card>
        )}

        <TwoFactorCard enabled={user.twoFactorEnabled} hasPassword={hasPassword} admin={user.role === 'SUPER_ADMIN' || user.role === 'ADMIN'} />
      </div>

      <div className="space-y-5">
        <Card className="animate-rise stagger-2 p-5 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-surface-3 font-display text-xl font-semibold text-ink">{initials(user.name)}</span>
          <p className="mt-3 font-medium text-ink">{user.name}</p>
          <p className="text-xs text-muted">{user.email}</p>
          <div className="mt-3">
            <Badge tone="accent">{ROLES[user.role] ?? user.role}</Badge>
          </div>
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">Membre depuis le {formatDate(user.createdAt)}</p>
        </Card>
        <Card className="animate-rise stagger-3 p-5">
          <p className="text-sm font-medium text-ink">Sessions ouvertes</p>
          <p className="mt-1 text-xs text-ink-2">
            {sessions} session{sessions > 1 ? 's' : ''} active{sessions > 1 ? 's' : ''}, celle-ci comprise.
          </p>
          <Button className="mt-4 w-full" icon={<LogOut className="h-4 w-4" />} loading={busy === 'sessions'} disabled={sessions <= 1} onClick={signOutOthers}>
            Fermer les autres sessions
          </Button>
        </Card>
      </div>
    </div>
  )
}
