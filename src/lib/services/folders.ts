import { z } from 'zod'

import type { Folder } from '@/generated/prisma/client'
import type { ProjectWithProvider } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { sanitizeFileName } from '@/lib/files/types'
import { newPublicId } from '@/lib/ids'
import { prisma } from '@/lib/prisma'
import { audit, type Actor } from '@/lib/services/audit'
import { withProvider } from '@/lib/storage'

/**
 * Dossiers (CDS 6.2, 8).
 *
 * L'arborescence existe deux fois : en base, où elle sert la navigation et la
 * recherche, et chez le fournisseur, où elle range les fichiers. La base fait
 * foi ; le Drive n'est jamais parcouru pour afficher un dossier.
 */
export const folderName = z
  .string()
  .trim()
  .min(1, 'Nom requis')
  .max(80, 'Nom trop long')
  .transform(sanitizeFileName)

export const createFolderInput = z.object({
  name: folderName,
  parentId: z.string().nullable().optional(),
})

export async function findFolder(projectId: string, publicId: string): Promise<Folder> {
  const folder = await prisma.folder.findFirst({ where: { projectId, publicId } })
  if (!folder) throw new ApiError('not_found', 'Dossier introuvable.')
  return folder
}

export async function listFolders(projectId: string, parentPublicId: string | null) {
  const parent = parentPublicId ? await findFolder(projectId, parentPublicId) : null
  return prisma.folder.findMany({
    where: { projectId, parentId: parent?.id ?? null },
    include: {
      parent: { select: { publicId: true } },
      _count: { select: { files: { where: { status: 'ACTIVE' } }, children: true } },
    },
    orderBy: { name: 'asc' },
  })
}

/** Chemin depuis la racine du projet, pour le fil d'Ariane. */
export async function folderPath(projectId: string, publicId: string | null) {
  const path: { id: string; name: string }[] = []
  let current = publicId ? await findFolder(projectId, publicId) : null
  // Borné : une boucle dans l'arborescence ne doit pas bloquer la requête.
  for (let depth = 0; current && depth < 32; depth += 1) {
    path.unshift({ id: current.publicId, name: current.name })
    current = current.parentId ? await prisma.folder.findUnique({ where: { id: current.parentId } }) : null
  }
  return path
}

export async function createFolder(
  project: ProjectWithProvider,
  input: z.infer<typeof createFolderInput>,
  actor: Actor,
) {
  const parent = input.parentId ? await findFolder(project.id, input.parentId) : null
  const existing = await prisma.folder.findFirst({
    where: { projectId: project.id, parentId: parent?.id ?? null, name: input.name },
  })
  if (existing) throw new ApiError('conflict', 'Un dossier porte déjà ce nom ici.')

  const providerFolderId = await withProvider(project.provider, (storage) =>
    storage.createFolder(input.name, parent?.providerFolderId ?? project.providerFolderId),
  )
  const folder = await prisma.folder.create({
    data: {
      publicId: newPublicId('folder'),
      projectId: project.id,
      parentId: parent?.id ?? null,
      name: input.name,
      providerFolderId,
    },
    include: { parent: { select: { publicId: true } } },
  })
  await audit(actor, { action: 'CREATE_FOLDER', projectId: project.id, target: folder.name })
  return folder
}

export async function renameFolder(project: ProjectWithProvider, publicId: string, name: string) {
  const folder = await findFolder(project.id, publicId)
  const clash = await prisma.folder.findFirst({
    where: { projectId: project.id, parentId: folder.parentId, name, NOT: { id: folder.id } },
  })
  if (clash) throw new ApiError('conflict', 'Un dossier porte déjà ce nom ici.')
  if (folder.providerFolderId) {
    await withProvider(project.provider, (storage) => storage.update(folder.providerFolderId!, { name }))
  }
  return prisma.folder.update({
    where: { id: folder.id },
    data: { name },
    include: { parent: { select: { publicId: true } } },
  })
}

/**
 * Supprime un dossier vide. Un dossier qui contient encore des fichiers, même
 * à la corbeille, est refusé : ces fichiers perdraient leur emplacement de
 * restauration, et la suppression en cascade d'un dossier entier est un
 * geste trop lourd pour un seul clic.
 */
export async function deleteFolder(project: ProjectWithProvider, publicId: string, actor: Actor) {
  const folder = await findFolder(project.id, publicId)
  const [files, children] = await Promise.all([
    prisma.file.count({ where: { folderId: folder.id, status: { not: 'DELETED' } } }),
    prisma.folder.count({ where: { parentId: folder.id } }),
  ])
  if (files > 0 || children > 0) {
    throw new ApiError('conflict', 'Le dossier n’est pas vide : déplacez ou supprimez d’abord son contenu.')
  }
  if (folder.providerFolderId) {
    await withProvider(project.provider, (storage) => storage.delete(folder.providerFolderId!))
  }
  await prisma.folder.delete({ where: { id: folder.id } })
  await audit(actor, { action: 'DELETE_FOLDER', projectId: project.id, target: folder.name })
}
