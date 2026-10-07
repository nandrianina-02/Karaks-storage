import { z } from 'zod'

import { ApiError } from '@/lib/api/errors'
import { newPublicId } from '@/lib/ids'
import { DEFAULT_PLAN, PLAN_IDS, planLabel, planLimits, type PlanId } from '@/lib/plans'
import { prisma } from '@/lib/prisma'
import { audit, type Actor } from '@/lib/services/audit'
import { canCreateProject, type GlobalRoleName } from '@/lib/security/permissions'
import { defaultProvider, forgetQuota, withProvider } from '@/lib/storage'

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
  trashRetentionDays: z.number().int().min(1).max(365).optional(),
  plan: z.enum(PLAN_IDS).optional(),
})

const LIMIT_FIELDS = ['maxFileSize', 'storageQuota', 'rateLimitPerMinute', 'signedUrlPerMinute'] as const

/** Valeurs de base d'une offre, au format attendu par Prisma. */
function limitsData(plan: PlanId) {
  const limits = planLimits(plan)
  if (!limits) return {}
  return {
    maxFileSize: BigInt(limits.maxFileSize),
    storageQuota: limits.storageQuota === null ? null : BigInt(limits.storageQuota),
    rateLimitPerMinute: limits.rateLimitPerMinute,
    signedUrlPerMinute: limits.signedUrlPerMinute,
  }
}

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
      plan: DEFAULT_PLAN,
      ...limitsData(DEFAULT_PLAN),
      members: { create: { userId: user.id, role: 'OWNER' } },
    },
  })
  await audit(actor, { action: 'CREATE_PROJECT', projectId: project.id, target: project.name })
  return project
}

/**
 * L'offre et les limites relèvent du super administrateur : un propriétaire
 * de projet qui pourrait relever son propre quota rendrait les offres
 * décoratives.
 */
export async function updateProject(
  projectId: string,
  input: z.infer<typeof projectSettingsInput>,
  actor: Actor,
  options: { canSetLimits: boolean },
) {
  const touchesLimits = input.plan !== undefined || LIMIT_FIELDS.some((field) => input[field] !== undefined)
  if (touchesLimits && !options.canSetLimits) {
    throw new ApiError('forbidden', 'L’offre et les limites d’un projet sont réservées au super administrateur.')
  }
  const current = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { plan: true } })
  const plan = input.plan ?? current.plan
  const manual = LIMIT_FIELDS.filter((field) => input[field] !== undefined)
  if (plan !== 'SUR_MESURE' && manual.length > 0) {
    throw new ApiError('bad_request', `Les limites suivent l’offre ${planLabel(plan)} : passez le projet en sur mesure pour les saisir.`, {
      fields: manual,
    })
  }

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
      trashRetentionDays: input.trashRetentionDays,
      plan: input.plan,
      // Choisir une offre recopie ses limites ; passer en sur mesure garde
      // les valeurs en place comme point de départ.
      ...(input.plan && input.plan !== current.plan ? limitsData(input.plan) : {}),
    },
  })
  await audit(actor, { action: 'UPDATE_PROJECT', projectId, target: project.name, details: { fields: Object.keys(input) } })
  return project
}

/** Supprimer un projet : propriétaire du projet ou super administrateur. */
export function canDeleteProject(globalRole: GlobalRoleName, projectRole: string | null): boolean {
  return globalRole === 'SUPER_ADMIN' || projectRole === 'OWNER'
}

/**
 * Supprime un projet et tout ce qu'il contient.
 *
 * Le fournisseur est vidé avant la base : si Google Drive échoue en route, le
 * projet reste en place et la suppression peut être relancée, au lieu de
 * laisser dans le Drive des fichiers que plus rien ne référence. Chaque
 * fichier est effacé un par un, corbeille comprise — les fichiers à la
 * corbeille vivent dans le dossier `trash` commun, pas dans celui du projet.
 *
 * Le journal du projet disparaît avec lui ; la suppression elle-même y est
 * inscrite hors projet, pour qu'il en reste une trace.
 */
export async function deleteProject(projectId: string, actor: Actor) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { provider: true } })
  const [files, folders, uploads] = await Promise.all([
    prisma.file.findMany({ where: { projectId }, select: { providerFileId: true, size: true } }),
    prisma.folder.findMany({ where: { projectId }, select: { id: true, parentId: true, providerFolderId: true } }),
    prisma.uploadSession.findMany({ where: { projectId, status: 'PENDING' }, select: { providerSession: true } }),
  ])

  await withProvider(project.provider, async (storage) => {
    for (const upload of uploads) {
      if (upload.providerSession) await storage.abortResumable(upload.providerSession)
    }
    // Quatre suppressions à la fois : assez pour avancer, sans heurter les
    // limites de requêtes de Google.
    const ids = files.map((file) => file.providerFileId).filter((id): id is string => Boolean(id))
    for (let index = 0; index < ids.length; index += 4) {
      await Promise.all(ids.slice(index, index + 4).map((id) => storage.delete(id)))
    }
    // Dossiers des plus profonds aux plus hauts, puis celui du projet.
    const depth = (id: string | null): number => {
      const folder = folders.find((item) => item.id === id)
      return folder ? 1 + depth(folder.parentId) : 0
    }
    for (const folder of [...folders].sort((a, b) => depth(b.id) - depth(a.id))) {
      if (folder.providerFolderId) await storage.delete(folder.providerFolderId)
    }
    if (project.providerFolderId) await storage.delete(project.providerFolderId)
  })
  forgetQuota(project.provider.id)

  await prisma.project.delete({ where: { id: projectId } })
  await audit(actor, {
    action: 'DELETE_PROJECT',
    target: project.name,
    details: {
      project: project.publicId,
      files: files.length,
      bytes: files.reduce((total, file) => total + Number(file.size), 0),
    },
  })
  return { name: project.name, files: files.length }
}
