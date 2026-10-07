import type { AuditAction, AuditResult, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Journal d'audit (CDS 23).
 *
 * Chaque entrée dit qui (compte ou clé), sur quel projet et quel fichier,
 * quoi, avec quel résultat, quand et d'où. Le journal ne doit jamais faire
 * échouer l'opération qu'il décrit : une erreur d'écriture est signalée dans
 * les journaux du serveur et l'opération continue.
 */
export interface Actor {
  userId?: string | null
  apiKeyId?: string | null
  ip?: string | null
  userAgent?: string | null
}

export interface AuditEntry {
  action: AuditAction
  result?: AuditResult
  projectId?: string | null
  fileId?: string | null
  target?: string | null
  details?: Prisma.InputJsonValue
}

export async function audit(actor: Actor, entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        result: entry.result ?? 'SUCCESS',
        projectId: entry.projectId ?? null,
        fileId: entry.fileId ?? null,
        target: entry.target ?? null,
        details: entry.details,
        userId: actor.userId ?? null,
        apiKeyId: actor.apiKeyId ?? null,
        ip: actor.ip ?? null,
        userAgent: actor.userAgent?.slice(0, 300) ?? null,
      },
    })
  } catch (error) {
    console.error('[audit]', error instanceof Error ? error.message : error)
  }
}

export function actorFromRequest(request: Request, ids: Pick<Actor, 'userId' | 'apiKeyId'>): Actor {
  return {
    ...ids,
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  }
}

/**
 * Adresse du client. Derrière un proxy (Railway, Vercel), seule la première
 * adresse de `X-Forwarded-For` est celle du client ; les suivantes sont
 * celles des relais.
 */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim() || null
  return request.headers.get('x-real-ip')
}

export const AUDIT_LABELS: Record<AuditAction, string> = {
  UPLOAD: 'Téléversement',
  DOWNLOAD: 'Téléchargement',
  STREAM: 'Lecture',
  UPDATE: 'Modification',
  DELETE: 'Mise à la corbeille',
  RESTORE: 'Restauration',
  DELETE_PERMANENT: 'Suppression définitive',
  CREATE_FOLDER: 'Création de dossier',
  DELETE_FOLDER: 'Suppression de dossier',
  CREATE_LINK: 'Lien temporaire créé',
  REVOKE_LINK: 'Lien temporaire révoqué',
  CREATE_API_KEY: 'Clé API créée',
  REVOKE_API_KEY: 'Clé API révoquée',
  CREATE_PROJECT: 'Projet créé',
  UPDATE_PROJECT: 'Projet modifié',
  DELETE_PROJECT: 'Projet supprimé',
  CONNECT_PROVIDER: 'Stockage connecté',
  CREATE_WEBHOOK: 'Webhook créé',
  DELETE_WEBHOOK: 'Webhook supprimé',
  LOGIN: 'Connexion',
  LOGIN_FAILED: 'Échec de connexion',
  ADD_MEMBER: 'Membre ajouté',
  REMOVE_MEMBER: 'Membre retiré',
  INVITE_MEMBER: 'Invitation',
  TRANSFER_OWNERSHIP: 'Propriété transférée',
}
