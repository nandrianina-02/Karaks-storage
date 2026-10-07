import { z } from 'zod'

import { ApiError } from '@/lib/api/errors'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/security/crypto'
import { audit, type Actor } from '@/lib/services/audit'
import { s3Config } from '@/lib/storage'
import { ProviderError } from '@/lib/storage/provider'
import { S3Provider } from '@/lib/storage/s3'

/**
 * Administration des fournisseurs (CDS V3) : ajout d'un stockage compatible
 * S3, choix du fournisseur des nouveaux projets, retrait d'un fournisseur
 * inutilisé. Réservé au super administrateur.
 */
export const s3Input = z.object({
  name: z.string().trim().min(2, 'Nom trop court').max(60),
  endpoint: z
    .string()
    .trim()
    .url('Adresse du point d’accès invalide')
    // Les clés transitent dans chaque signature : en production, jamais en clair.
    .refine((value) => process.env.NODE_ENV !== 'production' || value.startsWith('https://'), 'Le point d’accès doit être en https.')
    .transform((value) => value.replace(/\/$/, '')),
  region: z.string().trim().max(40).default('auto'),
  bucket: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'Nom de compartiment invalide (minuscules, chiffres, points et tirets)'),
  accessKeyId: z.string().trim().min(8, 'Identifiant de clé trop court').max(200),
  secretAccessKey: z.string().trim().min(16, 'Clé secrète trop courte').max(200),
  redirect: z.boolean().default(false),
})

export const providerUpdateInput = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  isDefault: z.literal(true).optional(),
  redirect: z.boolean().optional(),
})

export async function connectS3(input: z.infer<typeof s3Input>, actor: Actor) {
  const client = new S3Provider(input)
  // On n'enregistre que des identifiants qui ouvrent vraiment le compartiment.
  try {
    await client.check()
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : 'le service ne répond pas'
    throw new ApiError('bad_request', `Connexion au compartiment impossible : ${message}`)
  }
  const provider = await prisma.storageProvider.create({
    data: {
      kind: 'S3',
      name: input.name,
      status: 'CONNECTED',
      connectedAt: new Date(),
      accountEmail: `${input.bucket} · ${new URL(input.endpoint).host}`,
      credentials: encrypt(JSON.stringify({ accessKeyId: input.accessKeyId, secretAccessKey: input.secretAccessKey }), env.ENCRYPTION_KEY),
      config: { endpoint: input.endpoint, region: input.region || 'auto', bucket: input.bucket, redirect: input.redirect },
    },
  })
  await audit(actor, { action: 'CONNECT_PROVIDER', target: input.name, details: { kind: 'S3', bucket: input.bucket } })
  return provider
}

export async function updateProvider(id: string, input: z.infer<typeof providerUpdateInput>) {
  const provider = await prisma.storageProvider.findUnique({ where: { id } })
  if (!provider) throw new ApiError('not_found', 'Fournisseur introuvable.')
  if (input.isDefault && provider.status !== 'CONNECTED') {
    throw new ApiError('conflict', 'Seul un fournisseur connecté peut recevoir les nouveaux projets.')
  }
  if (input.redirect !== undefined && provider.kind !== 'S3') {
    throw new ApiError('bad_request', 'La diffusion directe n’existe que pour un stockage S3.')
  }
  const config = s3Config(provider)
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.storageProvider.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
    return tx.storageProvider.update({
      where: { id },
      data: {
        name: input.name,
        isDefault: input.isDefault,
        ...(input.redirect !== undefined && config ? { config: { ...config, redirect: input.redirect } } : {}),
      },
    })
  })
}

/** Un fournisseur qui porte encore un projet ou un fichier ne se retire pas. */
export async function removeProvider(id: string, actor: Actor) {
  const provider = await prisma.storageProvider.findUnique({
    where: { id },
    include: { _count: { select: { projects: true, files: true, migrationsFrom: true, migrationsTo: true } } },
  })
  if (!provider) throw new ApiError('not_found', 'Fournisseur introuvable.')
  if (provider.kind !== 'S3') throw new ApiError('bad_request', 'Seul un stockage S3 se retire d’ici.')
  if (provider._count.projects > 0 || provider._count.files > 0) {
    throw new ApiError('conflict', 'Ce stockage porte encore des projets ou des fichiers : déplacez-les d’abord.')
  }
  await prisma.providerMigration.deleteMany({ where: { OR: [{ fromProviderId: id }, { toProviderId: id }], status: { not: 'RUNNING' } } })
  await prisma.storageProvider.delete({ where: { id } })
  await audit(actor, { action: 'CONNECT_PROVIDER', target: provider.name, details: { kind: 'S3', removed: true } })
}
