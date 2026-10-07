import { z } from 'zod'

import { ApiError } from '@/lib/api/errors'
import { sendEmail } from '@/lib/email'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { hashSecret, randomBase62 } from '@/lib/security/crypto'
import type { GlobalRoleName } from '@/lib/security/permissions'
import { audit, type Actor } from '@/lib/services/audit'

/**
 * Membres d'un projet (CDS V2 : gestion avancée des membres).
 *
 * Une personne qui a déjà un compte est ajoutée tout de suite. Sinon elle
 * reçoit une invitation : un lien valable sept jours, qui la fait s'inscrire
 * puis rejoindre le projet avec le rôle prévu. Le lien n'est utilisable que
 * par un compte ouvert à l'adresse invitée : transmis à un tiers, il ne lui
 * ouvre rien.
 */
export const INVITATION_DAYS = 7

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propriétaire',
  ADMIN: 'Administration',
  DEVELOPER: 'Développement',
  VIEWER: 'Lecture seule',
}

export const memberInput = z.object({
  email: z.string().trim().toLowerCase().email('Adresse invalide'),
  role: z.enum(['ADMIN', 'DEVELOPER', 'VIEWER']),
})

export const transferInput = z.object({ userId: z.string().min(1) })

const tokenHash = (token: string) => hashSecret(token, env.API_SECRET)

export function invitationUrl(token: string) {
  return `${env.APP_URL.replace(/\/$/, '')}/invitation/${token}`
}

type ProjectRef = { id: string; name: string }

export async function addOrInviteMember(project: ProjectRef, input: z.infer<typeof memberInput>, inviter: { id: string; name: string }, actor: Actor) {
  const user = await prisma.user.findUnique({ where: { email: input.email } })

  if (user) {
    const existing = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: user.id } } })
    // Rétrograder le propriétaire laisserait le projet sans responsable : la
    // propriété se transfère d'abord, explicitement.
    if (existing?.role === 'OWNER') {
      throw new ApiError('conflict', 'Le propriétaire garde son rôle : transférez d’abord la propriété à un autre membre.')
    }
    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
      create: { projectId: project.id, userId: user.id, role: input.role },
      update: { role: input.role },
    })
    await audit(actor, {
      action: 'ADD_MEMBER',
      projectId: project.id,
      target: user.email,
      details: { role: input.role, previous: existing?.role ?? null },
    })
    // Une invitation restée en attente pour cette adresse n'a plus d'objet.
    await prisma.projectInvitation.deleteMany({ where: { projectId: project.id, email: input.email, acceptedAt: null } })
    return { kind: 'member' as const, member }
  }

  // Réinviter la même adresse renouvelle le lien : l'ancien cesse de marcher.
  const token = randomBase62(40)
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000)
  const invitation = await prisma.projectInvitation.upsert({
    where: { projectId_email: { projectId: project.id, email: input.email } },
    create: { projectId: project.id, email: input.email, role: input.role, tokenHash: tokenHash(token), invitedById: inviter.id, expiresAt },
    update: { role: input.role, tokenHash: tokenHash(token), invitedById: inviter.id, expiresAt, acceptedAt: null, createdAt: new Date() },
  })
  const url = invitationUrl(token)
  const mail = await sendEmail({
    to: input.email,
    subject: `${inviter.name} vous invite sur le projet ${project.name}`,
    text:
      `Bonjour,\n\n` +
      `${inviter.name} vous invite à rejoindre le projet « ${project.name} » sur Karaks Storage, ` +
      `avec le rôle ${ROLE_LABELS[input.role]}.\n\n` +
      `Pour accepter, ouvrez ce lien dans les ${INVITATION_DAYS} jours, puis créez votre compte avec cette adresse :\n${url}\n\n` +
      `Si vous ne connaissez pas cette personne, ignorez ce message.\n`,
  })
  await audit(actor, { action: 'INVITE_MEMBER', projectId: project.id, target: input.email, details: { role: input.role, emailSent: mail.sent } })
  return { kind: 'invitation' as const, invitation, url, sent: mail.sent }
}

export async function listInvitations(projectId: string) {
  return prisma.projectInvitation.findMany({
    where: { projectId, acceptedAt: null },
    include: { invitedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function revokeInvitation(projectId: string, invitationId: string, actor: Actor) {
  const invitation = await prisma.projectInvitation.findFirst({ where: { id: invitationId, projectId, acceptedAt: null } })
  if (!invitation) throw new ApiError('not_found', 'Invitation introuvable.')
  await prisma.projectInvitation.delete({ where: { id: invitation.id } })
  await audit(actor, { action: 'INVITE_MEMBER', projectId, target: invitation.email, details: { revoked: true } })
}

export type InvitationState = 'valid' | 'expired' | 'accepted'

/** Invitation désignée par un lien, ou `null` si le jeton ne correspond à rien. */
export async function findInvitation(token: string) {
  if (!/^[A-Za-z0-9]{20,80}$/.test(token)) return null
  const invitation = await prisma.projectInvitation.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { project: { select: { publicId: true, name: true } }, invitedBy: { select: { name: true } } },
  })
  if (!invitation) return null
  const state: InvitationState = invitation.acceptedAt ? 'accepted' : invitation.expiresAt < new Date() ? 'expired' : 'valid'
  return { ...invitation, state }
}

export async function acceptInvitation(token: string, user: { id: string; email: string }, actor: Actor) {
  const invitation = await findInvitation(token)
  if (!invitation) throw new ApiError('not_found', 'Ce lien d’invitation n’est pas valide.')
  if (invitation.state === 'accepted') throw new ApiError('gone', 'Cette invitation a déjà été acceptée.')
  if (invitation.state === 'expired') throw new ApiError('gone', 'Cette invitation a expiré. Demandez-en une nouvelle à l’administrateur du projet.')
  if (user.email.toLowerCase() !== invitation.email) {
    throw new ApiError('forbidden', `Cette invitation est adressée à ${invitation.email}. Connectez-vous avec ce compte pour l’accepter.`)
  }

  await prisma.$transaction(async (tx) => {
    // Accepter deux fois en parallèle ne doit produire qu'un seul ajout.
    const claimed = await tx.projectInvitation.updateMany({ where: { id: invitation.id, acceptedAt: null }, data: { acceptedAt: new Date() } })
    if (claimed.count === 0) throw new ApiError('gone', 'Cette invitation a déjà été acceptée.')
    const existing = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: invitation.projectId, userId: user.id } } })
    if (existing?.role === 'OWNER') return
    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId: invitation.projectId, userId: user.id } },
      create: { projectId: invitation.projectId, userId: user.id, role: invitation.role },
      update: { role: invitation.role },
    })
  })
  await audit(actor, { action: 'ADD_MEMBER', projectId: invitation.projectId, target: invitation.email, details: { role: invitation.role, via: 'invitation' } })
  return { project: invitation.project }
}

export async function removeMember(projectId: string, userId: string, actor: Actor) {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: { user: { select: { email: true } } },
  })
  if (!member) throw new ApiError('not_found', 'Membre introuvable.')
  // Un projet sans propriétaire ne pourrait plus être administré.
  if (member.role === 'OWNER') throw new ApiError('conflict', 'Le propriétaire ne peut pas être retiré : transférez d’abord la propriété.')
  await prisma.projectMember.delete({ where: { id: member.id } })
  await audit(actor, { action: 'REMOVE_MEMBER', projectId, target: member.user.email, details: { role: member.role } })
}

/** Transférer la propriété : le propriétaire lui-même, ou le super administrateur. */
export function canTransferOwnership(globalRole: GlobalRoleName, projectRole: string | null): boolean {
  return globalRole === 'SUPER_ADMIN' || projectRole === 'OWNER'
}

/**
 * Le nouveau propriétaire doit déjà être membre : on ne confie pas un projet
 * à quelqu'un qui n'y a jamais eu accès. L'ancien propriétaire reste dans le
 * projet, en administration, pour que la passation ne lui coupe pas l'accès.
 */
export async function transferOwnership(projectId: string, toUserId: string, actor: Actor) {
  const target = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: toUserId } },
    include: { user: { select: { email: true, status: true } } },
  })
  if (!target) throw new ApiError('not_found', 'Le nouveau propriétaire doit d’abord être membre du projet.')
  if (target.role === 'OWNER') throw new ApiError('conflict', 'Ce membre est déjà propriétaire.')
  if (target.user.status !== 'ACTIVE') throw new ApiError('conflict', 'Ce compte est suspendu : il ne peut pas recevoir le projet.')

  const previous = await prisma.$transaction(async (tx) => {
    const owners = await tx.projectMember.findMany({ where: { projectId, role: 'OWNER' }, select: { userId: true } })
    await tx.projectMember.updateMany({ where: { projectId, role: 'OWNER' }, data: { role: 'ADMIN' } })
    await tx.projectMember.update({ where: { id: target.id }, data: { role: 'OWNER' } })
    await tx.project.update({ where: { id: projectId }, data: { ownerId: toUserId } })
    return owners.map((owner) => owner.userId)
  })
  await audit(actor, { action: 'TRANSFER_OWNERSHIP', projectId, target: target.user.email, details: { previousOwners: previous } })
}
