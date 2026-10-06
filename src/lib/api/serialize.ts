import type {
  ApiKey,
  File,
  Folder,
  Project,
  SignedUrl,
  Webhook,
} from '@/generated/prisma/client'
import { categoryOf } from '@/lib/files/types'

/**
 * Représentations publiques.
 *
 * Seul endroit qui décide de ce qui sort par l'API : les identifiants du
 * fournisseur (`providerFileId`, dossiers Drive) n'y figurent jamais
 * (CDS 8, 24), et les identifiants internes sont remplacés par les
 * identifiants publics préfixés.
 */

export function fileDto(file: File & { folder?: Pick<Folder, 'publicId'> | null }) {
  return {
    id: file.publicId,
    name: file.originalName,
    extension: file.extension,
    mimeType: file.mimeType,
    category: categoryOf(file.mimeType),
    size: Number(file.size),
    checksum: file.checksum,
    folderId: file.folder?.publicId ?? null,
    status: file.status.toLowerCase(),
    durationSeconds: file.durationSeconds,
    width: file.width,
    height: file.height,
    waveform: file.waveform,
    streams: file.streamCount,
    downloads: file.downloadCount,
    lastAccessAt: file.lastAccessAt?.toISOString() ?? null,
    trashedAt: file.trashedAt?.toISOString() ?? null,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  }
}

export type FileDto = ReturnType<typeof fileDto>

export function folderDto(
  folder: Folder & {
    parent?: Pick<Folder, 'publicId'> | null
    _count?: { files?: number; children?: number }
  },
) {
  return {
    id: folder.publicId,
    name: folder.name,
    parentId: folder.parent?.publicId ?? null,
    files: folder._count?.files ?? null,
    folders: folder._count?.children ?? null,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  }
}

export type FolderDto = ReturnType<typeof folderDto>

export function projectDto(project: Project & { role?: string | null }) {
  return {
    id: project.publicId,
    name: project.name,
    slug: project.slug,
    description: project.description,
    allowedOrigins: project.allowedOrigins,
    maxFileSize: Number(project.maxFileSize),
    storageQuota: project.storageQuota === null ? null : Number(project.storageQuota),
    rateLimitPerMinute: project.rateLimitPerMinute,
    signedUrlPerMinute: project.signedUrlPerMinute,
    role: project.role ?? null,
    createdAt: project.createdAt.toISOString(),
  }
}

export type ProjectDto = ReturnType<typeof projectDto>

export function apiKeyDto(key: ApiKey) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    permissions: key.permissions,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
  }
}

export type ApiKeyDto = ReturnType<typeof apiKeyDto>

export type LinkStatus = 'active' | 'expired' | 'revoked' | 'exhausted'

export function linkStatus(link: SignedUrl, now = new Date()): LinkStatus {
  if (link.revokedAt) return 'revoked'
  if (link.expiresAt <= now) return 'expired'
  if (link.maxUses !== null && link.uses >= link.maxUses) return 'exhausted'
  return 'active'
}

export function linkDto(link: SignedUrl & { file?: Pick<File, 'publicId' | 'originalName' | 'mimeType'> }) {
  return {
    id: link.id,
    hint: link.hint,
    type: link.type.toLowerCase(),
    status: linkStatus(link),
    fileId: link.file?.publicId ?? null,
    fileName: link.file?.originalName ?? null,
    mimeType: link.file?.mimeType ?? null,
    expiresAt: link.expiresAt.toISOString(),
    maxUses: link.maxUses,
    uses: link.uses,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    lastUsedAt: link.lastUsedAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
  }
}

export type LinkDto = ReturnType<typeof linkDto>

export function webhookDto(hook: Webhook & { deliveries?: { success: boolean; createdAt: Date; statusCode: number | null }[] }) {
  const last = hook.deliveries?.[0]
  return {
    id: hook.id,
    url: hook.url,
    events: hook.events,
    active: hook.active,
    lastDelivery: last
      ? { success: last.success, statusCode: last.statusCode, at: last.createdAt.toISOString() }
      : null,
    createdAt: hook.createdAt.toISOString(),
  }
}

export type WebhookDto = ReturnType<typeof webhookDto>
