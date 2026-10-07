'use client'

import { Check, Clock, Copy, Crown, Mail, Trash2, TriangleAlert, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/field'
import { Badge, Card, CardHeader } from '@/components/ui/surface'
import { useToast } from '@/components/ui/toast'
import { api, errorMessage } from '@/lib/client/api'
import { formatDate, formatRelative } from '@/lib/utils'

const ROLE_LABELS: Record<string, string> = { OWNER: 'Propriétaire', ADMIN: 'Administration', DEVELOPER: 'Développement', VIEWER: 'Lecture seule' }

export interface MemberRow {
  userId: string
  name: string
  email: string
  role: string
  since: string
}

export interface InvitationRow {
  id: string
  email: string
  role: string
  invitedBy: string | null
  expiresAt: string
}

interface InvitationResult {
  email: string
  url: string
  emailSent: boolean
}

/**
 * Membres du projet (CDS V2) : ajout direct d'un compte existant, invitation
 * par courriel sinon, rôles, retrait et transfert de la propriété.
 */
export function MembersForm({
  project,
  members,
  invitations,
  editable,
  canTransfer,
  me,
}: {
  project: string
  members: MemberRow[]
  invitations: InvitationRow[]
  editable: boolean
  canTransfer: boolean
  me: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('DEVELOPER')
  const [busy, setBusy] = useState(false)
  const [invited, setInvited] = useState<InvitationResult | null>(null)
  const [transfer, setTransfer] = useState<MemberRow | null>(null)
  const refresh = () => startTransition(() => router.refresh())

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const data = await api<{ member?: unknown; invitation?: InvitationResult }>(`/api/v1/projects/${project}/members`, {
        method: 'POST',
        body: { email, role },
      })
      if (data.invitation) setInvited(data.invitation)
      else toast.success('Membre ajouté', email)
      setEmail('')
      refresh()
    } catch (error) {
      toast.error('Ajout impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function change(member: MemberRow, next: string) {
    try {
      await api(`/api/v1/projects/${project}/members`, { method: 'POST', body: { email: member.email, role: next } })
      toast.success('Rôle modifié', `${member.name} : ${ROLE_LABELS[next]}`)
      refresh()
    } catch (error) {
      toast.error('Modification impossible', errorMessage(error))
    }
  }

  async function remove(member: MemberRow) {
    try {
      await api(`/api/v1/projects/${project}/members/${member.userId}`, { method: 'DELETE' })
      toast.success('Membre retiré', member.name)
      refresh()
    } catch (error) {
      toast.error('Retrait impossible', errorMessage(error))
    }
  }

  async function revoke(invitation: InvitationRow) {
    try {
      await api(`/api/v1/projects/${project}/invitations/${invitation.id}`, { method: 'DELETE' })
      toast.success('Invitation annulée', invitation.email)
      refresh()
    } catch (error) {
      toast.error('Annulation impossible', errorMessage(error))
    }
  }

  async function resend(invitation: InvitationRow) {
    try {
      const data = await api<{ invitation: InvitationResult }>(`/api/v1/projects/${project}/members`, {
        method: 'POST',
        body: { email: invitation.email, role: invitation.role },
      })
      setInvited(data.invitation)
      refresh()
    } catch (error) {
      toast.error('Renvoi impossible', errorMessage(error))
    }
  }

  return (
    <div className="space-y-5">
      {editable && (
        <Card className="animate-rise stagger-1">
          <CardHeader
            title="Ajouter un membre"
            icon={<UserPlus />}
            description="Un compte existant est ajouté aussitôt. Une adresse inconnue reçoit une invitation valable sept jours."
          />
          <form onSubmit={add} className="flex flex-wrap items-end gap-3 px-5 pb-5">
            <Field label="Adresse email" htmlFor="m-email" className="min-w-60 flex-1">
              <Input id="m-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </Field>
            <Field label="Rôle" htmlFor="m-role">
              <Select id="m-role" value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="ADMIN">Administration</option>
                <option value="DEVELOPER">Développement</option>
                <option value="VIEWER">Lecture seule</option>
              </Select>
            </Field>
            <Button type="submit" variant="primary" loading={busy} icon={<UserPlus className="h-4 w-4" />}>
              Ajouter
            </Button>
          </form>
        </Card>
      )}

      <Card className="animate-rise stagger-2">
        <CardHeader
          title="Membres du projet"
          description="Administration : tout ; Développement : tout sauf les réglages ; Lecture seule : lister et diffuser."
        />
        <ul>
          {members.map((member) => (
            <li key={member.userId} className="animate-fade flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  {member.name}
                  {member.userId === me && <span className="ml-1.5 text-xs text-muted">(vous)</span>}
                </p>
                <p className="text-xs text-muted">
                  {member.email} · depuis le {formatDate(member.since)}
                </p>
              </div>
              {member.role === 'OWNER' || !editable ? (
                <Badge tone={member.role === 'OWNER' ? 'accent' : 'neutral'} icon={member.role === 'OWNER' ? <Crown /> : undefined}>
                  {ROLE_LABELS[member.role]}
                </Badge>
              ) : (
                <>
                  <Select
                    value={member.role}
                    onChange={(event) => change(member, event.target.value)}
                    className="h-9 w-auto text-[0.82rem]"
                    aria-label={`Rôle de ${member.name}`}
                  >
                    <option value="ADMIN">Administration</option>
                    <option value="DEVELOPER">Développement</option>
                    <option value="VIEWER">Lecture seule</option>
                  </Select>
                  {canTransfer && (
                    <Button size="sm" variant="ghost" icon={<Crown className="h-3.5 w-3.5" />} onClick={() => setTransfer(member)}>
                      Confier le projet
                    </Button>
                  )}
                  <Button size="sm" variant="danger-ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => remove(member)}>
                    Retirer
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {editable && invitations.length > 0 && (
        <Card className="animate-rise stagger-3">
          <CardHeader title="Invitations en attente" icon={<Mail />} description="Elles deviennent des membres quand la personne crée son compte et accepte." />
          <ul>
            {invitations.map((invitation) => {
              const expired = new Date(invitation.expiresAt) < new Date()
              return (
                <li key={invitation.id} className="animate-fade flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{invitation.email}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <Clock className="h-3 w-3" />
                      {ROLE_LABELS[invitation.role]} · {expired ? 'expirée' : `expire ${formatRelative(invitation.expiresAt)}`}
                      {invitation.invitedBy ? ` · par ${invitation.invitedBy}` : ''}
                    </p>
                  </div>
                  {expired && <Badge tone="warning">Expirée</Badge>}
                  <Button size="sm" icon={<Mail className="h-3.5 w-3.5" />} onClick={() => resend(invitation)}>
                    Renvoyer
                  </Button>
                  <Button size="sm" variant="danger-ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => revoke(invitation)}>
                    Annuler
                  </Button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Dialog
        open={invited !== null}
        onClose={() => setInvited(null)}
        title="Invitation créée"
        icon={<Mail className="h-[18px] w-[18px]" />}
        footer={
          <Button variant="primary" onClick={() => setInvited(null)}>
            Terminé
          </Button>
        }
      >
        {invited && <InvitationLink invitation={invited} />}
      </Dialog>

      <TransferDialog project={project} member={transfer} onClose={() => setTransfer(null)} onDone={refresh} />
    </div>
  )
}

function InvitationLink({ invitation }: { invitation: InvitationResult }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-3 text-sm text-ink-2">
      <p>
        {invitation.emailSent
          ? `Un courriel est parti vers ${invitation.email}. Vous pouvez aussi lui transmettre le lien vous-même :`
          : `Aucun serveur de courriel n’est configuré : transmettez ce lien à ${invitation.email}. Il ne fonctionne qu’avec un compte ouvert à cette adresse.`}
      </p>
      <div className="flex gap-2">
        <Input readOnly value={invitation.url} className="font-mono text-[0.78rem]" onFocus={(event) => event.target.select()} aria-label="Lien d’invitation" />
        <Button
          icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          onClick={async () => {
            await navigator.clipboard.writeText(invitation.url)
            setCopied(true)
          }}
        >
          {copied ? 'Copié' : 'Copier'}
        </Button>
      </div>
      <p className="text-xs text-muted">Le lien est montré une seule fois. Renvoyer l’invitation en crée un nouveau et désactive celui-ci.</p>
    </div>
  )
}

/**
 * Transfert de propriété : l'adresse à retaper oblige à vérifier à qui l'on
 * confie le projet, car on ne peut pas revenir en arrière soi-même.
 */
function TransferDialog({ project, member, onClose, onDone }: { project: string; member: MemberRow | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState(member)
  if (member !== last) {
    setLast(member)
    setConfirm('')
  }

  async function submit() {
    if (!member) return
    setBusy(true)
    try {
      await api(`/api/v1/projects/${project}/transfer`, { method: 'POST', body: { userId: member.userId } })
      toast.success('Propriété transférée', `${member.name} est désormais propriétaire du projet.`)
      onClose()
      onDone()
    } catch (error) {
      toast.error('Transfert impossible', errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={member !== null}
      onClose={onClose}
      size="sm"
      title={member ? `Confier le projet à ${member.name} ?` : ''}
      icon={<TriangleAlert className="h-[18px] w-[18px]" />}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" loading={busy} disabled={!member || confirm.trim().toLowerCase() !== member.email.toLowerCase()} onClick={submit}>
            Transférer la propriété
          </Button>
        </>
      }
    >
      {member && (
        <div className="space-y-4 text-sm text-ink-2">
          <p>
            {member.name} pourra supprimer le projet et en transférer à son tour la propriété. Vous resterez dans le projet, avec le rôle
            Administration.
          </p>
          <Field label={`Pour confirmer, tapez ${member.email}`} htmlFor="transfer-confirm">
            <Input id="transfer-confirm" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" data-autofocus />
          </Field>
        </div>
      )}
    </Dialog>
  )
}
