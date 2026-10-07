import type { File, Folder, Prisma, ProviderMigration, StorageProvider as ProviderRow } from '@/generated/prisma/client'
import { ApiError } from '@/lib/api/errors'
import { prisma } from '@/lib/prisma'
import { audit, type Actor } from '@/lib/services/audit'
import { abortUpload } from '@/lib/services/uploads'
import { ensureDriveLayout, forgetQuota, providerLabel, withProvider } from '@/lib/storage'
import { CHUNK_SIZE } from '@/lib/storage/provider'

/**
 * Changement de stockage d'un projet (CDS V3) : Google Drive vers R2, par
 * exemple, sans interrompre le service.
 *
 * 1. Au départ, le projet bascule sur la destination : ses dossiers y sont
 *    recréés et les nouveaux envois y vont aussitôt.
 * 2. Les fichiers existants sont ensuite copiés un à un, morceau par morceau,
 *    puis effacés chez la source. Pendant ce temps chaque lecture va chercher
 *    le fichier là où il se trouve (voir `fileProvider`).
 * 3. Une fois la source vidée, ses dossiers sont supprimés.
 *
 * Le travail avance par tranches bornées dans le temps, depuis la page des
 * réglages ou la tâche de nuit : la position dans le fichier en cours est
 * enregistrée après chaque morceau, si bien qu'un gros fichier reprend là où
 * la tranche précédente s'est arrêtée.
 */
const ACTIVE_FILES = { in: ['ACTIVE', 'TRASHED'] as ('ACTIVE' | 'TRASHED')[] }

export async function startMigration(projectId: string, toProviderId: string, actor: Actor) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { provider: true, folders: true } })
  let target = await prisma.storageProvider.findUnique({ where: { id: toProviderId } })
  if (!target) throw new ApiError('not_found', 'Fournisseur de destination introuvable.')
  if (target.status !== 'CONNECTED') throw new ApiError('conflict', 'Le fournisseur de destination n’est pas connecté.')
  if (target.id === project.providerId) throw new ApiError('conflict', 'Le projet est déjà sur ce stockage.')
  const running = await prisma.providerMigration.findFirst({ where: { projectId, status: 'RUNNING' } })
  if (running) throw new ApiError('conflict', 'Un changement de stockage est déjà en cours pour ce projet.')
  if (target.kind === 'GOOGLE_DRIVE') target = await ensureDriveLayout(target)

  // Les envois en cours visent l'ancien stockage : ils sont fermés, le client
  // les recommencera sur le nouveau.
  const pending = await prisma.uploadSession.findMany({ where: { projectId, status: 'PENDING' }, select: { publicId: true } })
  for (const upload of pending) await abortUpload(project, upload.publicId)

  // Dossiers recréés chez la destination, parents d'abord.
  const destination = target
  const created = await withProvider(destination, async (storage) => {
    const root = await storage.createFolder(project.slug, destination.projectsFolderId ?? null)
    const ids = new Map<string, string>()
    const depth = (folder: Folder): number => {
      const parent = project.folders.find((item) => item.id === folder.parentId)
      return parent ? 1 + depth(parent) : 0
    }
    for (const folder of [...project.folders].sort((a, b) => depth(a) - depth(b))) {
      ids.set(folder.id, await storage.createFolder(folder.name, folder.parentId ? ids.get(folder.parentId)! : root))
    }
    return { root, ids }
  })

  const totals = await prisma.file.aggregate({
    where: { projectId, providerId: { not: target.id }, status: ACTIVE_FILES },
    _count: { _all: true },
    _sum: { size: true },
  })
  const sourceFolders = [...project.folders.map((folder) => folder.providerFolderId), project.providerFolderId].filter((id): id is string => Boolean(id))

  const migration = await prisma.$transaction(async (tx) => {
    for (const [folderId, providerFolderId] of created.ids) {
      await tx.folder.update({ where: { id: folderId }, data: { providerFolderId } })
    }
    await tx.project.update({ where: { id: projectId }, data: { providerId: destination.id, providerFolderId: created.root } })
    return tx.providerMigration.create({
      data: {
        projectId,
        fromProviderId: project.providerId,
        toProviderId: destination.id,
        totalFiles: totals._count._all,
        totalBytes: totals._sum.size ?? BigInt(0),
        sourceFolders,
        startedById: actor.userId ?? null,
      },
    })
  })
  await audit(actor, {
    action: 'MIGRATE_STORAGE',
    projectId,
    target: project.name,
    details: { from: providerLabel(project.provider), to: providerLabel(destination), files: totals._count._all },
  })
  return migration
}

type Loaded = ProviderMigration & { project: { id: string; name: string }; to: ProviderRow }

/** Avance une migration pendant au plus `budgetMs`. */
export async function stepMigration(id: string, budgetMs = 40_000): Promise<ProviderMigration> {
  const started = Date.now()
  let migration = (await prisma.providerMigration.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true } }, to: true },
  })) as Loaded | null
  if (!migration) throw new ApiError('not_found', 'Changement de stockage introuvable.')
  if (migration.status !== 'RUNNING') return migration

  try {
    while (Date.now() - started < budgetMs) {
      const file: File | null = migration.currentFileId
        ? await prisma.file.findFirst({ where: { id: migration.currentFileId, status: ACTIVE_FILES } })
        : await prisma.file.findFirst({
            where: { projectId: migration.projectId, providerId: { not: migration.toProviderId }, status: ACTIVE_FILES },
            orderBy: { createdAt: 'asc' },
          })

      if (!file) {
        if (migration.currentFileId) {
          // Le fichier a été supprimé pendant sa copie : la copie partielle part.
          if (migration.currentSession) {
            const session = migration.currentSession
            await withProvider(migration.to, (storage) => storage.abortResumable(session)).catch(() => undefined)
          }
          migration = { ...migration, ...(await save(migration.id, { currentFileId: null, currentSession: null, currentOffset: BigInt(0) })) }
          continue
        }
        return await finish(migration)
      }
      migration = { ...migration, ...(await copyStep(migration, file, started, budgetMs)) }
    }
    return migration
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    // L'erreur est gardée pour être affichée ; la migration reste en cours et
    // la tranche suivante réessaiera à partir de la dernière position sûre.
    return save(migration.id, { error: message })
  }
}

function save(id: string, data: Prisma.ProviderMigrationUpdateInput) {
  return prisma.providerMigration.update({ where: { id }, data })
}

/** Copie la suite d'un fichier, morceau par morceau, dans le temps imparti. */
async function copyStep(migration: Loaded, file: File, started: number, budgetMs: number) {
  const size = Number(file.size)
  const source = await prisma.storageProvider.findUniqueOrThrow({ where: { id: file.providerId } })
  const folder = file.folderId ? await prisma.folder.findUnique({ where: { id: file.folderId } }) : null
  const project = await prisma.project.findUniqueOrThrow({ where: { id: migration.projectId } })
  const parentId = folder?.providerFolderId ?? project.providerFolderId

  let session = migration.currentFileId === file.id ? migration.currentSession : null
  let offset = migration.currentFileId === file.id ? Number(migration.currentOffset) : 0
  let object: { id: string; size: number } | undefined

  if (size === 0) {
    const empty = await withProvider(migration.to, (storage) =>
      storage.upload({ name: file.storageName, mimeType: file.mimeType, parentId, data: new Uint8Array(0) }),
    )
    object = { id: empty.id, size: 0 }
  } else {
    if (!session) {
      session = await withProvider(migration.to, (storage) =>
        storage.startResumable({ name: file.storageName, mimeType: file.mimeType, parentId, size }),
      )
      offset = 0
      await save(migration.id, { currentFileId: file.id, currentSession: session, currentOffset: BigInt(0), error: null })
    }
    while (!object) {
      if (Date.now() - started >= budgetMs) {
        return { currentFileId: file.id, currentSession: session, currentOffset: BigInt(offset) }
      }
      const end = Math.min(offset + CHUNK_SIZE, size) - 1
      const stream = await withProvider(source, (storage) => storage.createReadStream(file.providerFileId!, { start: offset, end }))
      const chunk = new Uint8Array(await new Response(stream).arrayBuffer())
      if (chunk.byteLength !== end - offset + 1) throw new Error(`Lecture incomplète de ${file.originalName} chez la source.`)
      const current = session
      const state = await withProvider(migration.to, (storage) => storage.uploadChunk(current, chunk, offset, size))
      const advanced = state.received - offset
      offset = state.received
      await save(migration.id, { currentOffset: BigInt(offset), ...(advanced > 0 ? { movedBytes: { increment: advanced } } : {}), error: null })
      if (state.done) object = state.object
    }
  }

  if (!object || object.size !== size) {
    throw new Error(`La copie de ${file.originalName} ne fait pas la bonne taille.`)
  }
  const previous = file.providerFileId
  const moved = object
  const updated = await prisma.$transaction(async (tx) => {
    await tx.file.update({ where: { id: file.id }, data: { providerId: migration.toProviderId, providerFileId: moved.id } })
    return tx.providerMigration.update({
      where: { id: migration.id },
      data: {
        movedFiles: { increment: 1 },
        currentFileId: null,
        currentSession: null,
        currentOffset: BigInt(0),
        error: null,
      },
    })
  })
  // La copie fait foi : l'original peut partir. Un échec ici laisse un objet
  // orphelin chez la source, sans conséquence pour le service.
  if (previous) await withProvider(source, (storage) => storage.delete(previous)).catch(() => undefined)
  forgetQuota(source.id)
  forgetQuota(migration.toProviderId)
  return updated
}

async function finish(migration: Loaded) {
  const source = await prisma.storageProvider.findUnique({ where: { id: migration.fromProviderId } })
  if (source && source.id !== migration.toProviderId) {
    // Sous-dossiers d'abord : ils sont enregistrés avant le dossier du projet.
    for (const folderId of migration.sourceFolders) {
      await withProvider(source, (storage) => storage.delete(folderId)).catch(() => undefined)
    }
  }
  const done = await save(migration.id, { status: 'DONE', finishedAt: new Date(), error: null })
  await audit({ userId: null, userAgent: 'migration' }, {
    action: 'MIGRATE_STORAGE',
    projectId: migration.projectId,
    target: migration.project.name,
    details: { finished: true, files: migration.movedFiles },
  })
  return done
}

/** Arrête une migration. Les fichiers déjà copiés restent chez la destination. */
export async function cancelMigration(id: string) {
  const migration = await prisma.providerMigration.findUnique({ where: { id }, include: { to: true } })
  if (!migration || migration.status !== 'RUNNING') throw new ApiError('not_found', 'Aucun changement de stockage en cours.')
  if (migration.currentSession) {
    const session = migration.currentSession
    await withProvider(migration.to, (storage) => storage.abortResumable(session)).catch(() => undefined)
  }
  return save(id, { status: 'FAILED', finishedAt: new Date(), error: 'Arrêtée par un administrateur.', currentFileId: null, currentSession: null })
}

/** Fait avancer les migrations en cours : appelé par la maintenance. */
export async function advanceMigrations(budgetMs: number) {
  const started = Date.now()
  const running = await prisma.providerMigration.findMany({ where: { status: 'RUNNING' }, select: { id: true }, orderBy: { startedAt: 'asc' } })
  let advanced = 0
  for (const migration of running) {
    const left = budgetMs - (Date.now() - started)
    if (left < 5000) break
    await stepMigration(migration.id, left)
    advanced += 1
  }
  return advanced
}

export function migrationDto(migration: ProviderMigration) {
  return {
    id: migration.id,
    projectId: migration.projectId,
    status: migration.status,
    totalFiles: migration.totalFiles,
    movedFiles: migration.movedFiles,
    totalBytes: Number(migration.totalBytes),
    movedBytes: Number(migration.movedBytes),
    error: migration.error,
    startedAt: migration.startedAt.toISOString(),
    finishedAt: migration.finishedAt?.toISOString() ?? null,
  }
}
