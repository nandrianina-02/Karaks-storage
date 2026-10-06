import { z } from 'zod'

import { ApiError } from '@/lib/api/errors'
import { newPublicId } from '@/lib/ids'
import { prisma } from '@/lib/prisma'
import { audit, type Actor } from '@/lib/services/audit'
import { canCreateProject, type GlobalRoleName } from '@/lib/security/permissions'
import { defaultProvider, withProvider } from '@/lib/storage'

/**
 * Projets (CDS 7) : chacun a ses fichiers, ses clés, ses réglages et ses
 * statistiques. Un projet reçoit son dossier chez le fournisseur dès sa
 * création, sous `KARAKS STORAGE/projects/<slug>`.
 */

const origin = z
  .string()
  .trim()
  .url('Origine invalide')
  .transform((value) => new URL(value).origin)

export const projectInput = z.object({
  name: z.string().trim().min(2, 'Nom trop court').max(60, 'Nom trop long'),
  description: z.string().trim().max(240).optional().nullable(),
  allowedOrigins: z.array(origin).max(20).optional(),
})

export const projectSettingsInput = projectInput.partial().extend({
  maxFileSize: z.number().int().min(1024).max(5 * 1024 ** 3).optional(),
  storageQuota: z.number().int().min(0).nullable().optional(),
  rateLimitPerMinute: z.number().int().min(10).max(10_000).optional(),
  signedUrlPerMinute: z.number().int().min(1).max(1_000).optional(),
})

export function slugify(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'projet'
  )
}

async function uniqueSlug(base: string): Promise<string> {
  for (let index = 1; index < 100; index += 1) {
    const candidate = index === 1 ? base : `${base}-${index}`
    if (!(await prisma.project.findUnique({ where: { slug: candidate } }))) return candidate
  }
  return `${base}-${Date.now().toString(36)}`
}

export async function listProjectsFor(user: { id: string; role: GlobalRoleName }) {
  const projects = await prisma.project.findMany({
    where: user.role === 'SUPER_ADMIN' ? {} : { members: { some: { userId: user.id } } },
    include: { members: { where: { userId: user.id }, select: { role: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return projects.map(({ members, ...project }) => ({
    ...project,
    role: members[0]?.role ?? (user.role === 'SUPER_ADMIN' ? 'OWNER' : null),
  }))
}

export async function createProject(
  input: z.infer<typeof projectInput>,
  user: { id: string; role: GlobalRoleName },
  actor: Actor,
) {
  if (!canCreateProject(user.role)) {
    throw new ApiError('forbidden', 'Seul un administrateur peut créer un projet.')
  }
  const provider = await defaultProvider()
  const slug = await uniqueSlug(slugify(input.name))

  const providerFolderId = await withProvider(provider, (storage) =>
    storage.createFolder(slug, provider.projectsFolderId ?? null),
  )

  const project = await prisma.project.create({
    data: {
      publicId: newPublicId('project'),
      name: input.name,
      slug,
      description: input.description ?? null,
      allowedOrigins: input.allowedOrigins ?? [],
      ownerId: user.id,
      providerId: provider.id,
      providerFolderId,
      members: { create: { userId: user.id, role: 'OWNER' } },
    },
  })
  await audit(actor, { action: 'CREATE_PROJECT', projectId: project.id, target: project.name })
  return project
}

export async function updateProject(projectId: string, input: z.infer<typeof projectSettingsInput>, actor: Actor) {
  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      name: input.name,
      description: input.description,
      allowedOrigins: input.allowedOrigins,
      maxFileSize: input.maxFileSize === undefined ? undefined : BigInt(input.maxFileSize),
      storageQuota:
        input.storageQuota === undefined ? undefined : input.storageQuota === null ? null : BigInt(input.storageQuota),
      rateLimitPerMinute: input.rateLimitPerMinute,
      signedUrlPerMinute: input.signedUrlPerMinute,
    },
  })
  await audit(actor, { action: 'UPDATE_PROJECT', projectId, target: project.name, details: { fields: Object.keys(input) } })
  return project
}

export const memberInput = z.object({
  email: z.string().trim().toLowerCase().email('Adresse invalide'),
  role: z.enum(['ADMIN', 'DEVELOPER', 'VIEWER']),
})

export async function addMember(projectId: string, input: z.infer<typeof memberInput>) {
  const user = await prisma.user.findUnique({ where: { email: input.email } })
  if (!user) {
    throw new ApiError('not_found', 'Aucun compte n’utilise cette adresse : la personne doit d’abord s’inscrire.')
  }
  return prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId: user.id } },
    create: { projectId, userId: user.id, role: input.role },
    update: { role: input.role },
  })
}

export async function removeMember(projectId: string, userId: string) {
  const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } })
  if (!member) throw new ApiError('not_found', 'Membre introuvable.')
  // Un projet sans propriétaire ne pourrait plus être administré.
  if (member.role === 'OWNER') throw new ApiError('conflict', 'Le propriétaire ne peut pas être retiré.')
  await prisma.projectMember.delete({ where: { id: member.id } })
}
