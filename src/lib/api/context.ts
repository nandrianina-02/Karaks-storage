import { after } from 'next/server'

import type { Project, StorageProvider } from '@/generated/prisma/client'
import { ApiError, toErrorResponse } from '@/lib/api/errors'
import { auth } from '@/lib/auth'
import { drainBackground, isServerless } from '@/lib/background'
import { appUrl, env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { actorFromRequest, type Actor } from '@/lib/services/audit'
import { recordUsage } from '@/lib/services/usage'
import { hashSecret } from '@/lib/security/crypto'
import {
  isPermission,
  permissionsFor,
  type GlobalRoleName,
  type Permission,
  type ProjectRoleName,
} from '@/lib/security/permissions'
import { rateLimit } from '@/lib/security/rate-limit'

/**
 * Qui appelle l'API, pour quel projet, avec quels droits.
 *
 * Deux façons de s'authentifier, une seule vérification ensuite :
 *
 * - une **clé API** (`Authorization: Bearer ks_…`), rattachée à un projet et
 *   porteuse de ses propres permissions — c'est ainsi que Karaks appelle le
 *   service ;
 * - la **session** du tableau de bord, le projet étant désigné par l'en-tête
 *   `X-Project` ; les droits viennent alors du rôle dans le projet.
 */
export type ProjectWithProvider = Project & { provider: StorageProvider }

export interface Caller {
  kind: 'user' | 'apiKey'
  user: { id: string; name: string; email: string; role: GlobalRoleName } | null
  apiKey: { id: string; name: string; projectId: string; permissions: Permission[] } | null
  actor: Actor
}

export interface ApiContext extends Caller {
  project: ProjectWithProvider
  permissions: ReadonlySet<Permission>
  can(permission: Permission): boolean
  require(...permissions: Permission[]): void
}

const API_KEY_PATTERN = /^ks_(live|test)_[0-9A-Za-z]{32,64}$/

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  return match?.[1] ?? request.headers.get('x-api-key')
}

/**
 * Protection CSRF des appels faits avec le cookie de session (CDS 24).
 *
 * Une clé API n'est jamais envoyée d'office par un navigateur : seul le
 * cookie l'est, et c'est lui qu'un site tiers pourrait détourner. Pour toute
 * écriture authentifiée par cookie, l'origine doit donc être celle du
 * tableau de bord.
 */
function assertSameOrigin(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  if (origin ? origin === new URL(appUrl).origin : site === 'same-origin') return
  throw new ApiError('forbidden', 'Origine de la requête non autorisée.')
}

let lastKeyTouch = new Map<string, number>()

export async function identify(request: Request): Promise<Caller> {
  const token = bearer(request)

  if (token) {
    if (!API_KEY_PATTERN.test(token)) throw new ApiError('unauthorized', 'Clé API invalide.')
    const key = await prisma.apiKey.findUnique({ where: { hash: hashSecret(token, env.API_SECRET) } })
    if (!key || key.revokedAt) throw new ApiError('unauthorized', 'Clé API invalide ou révoquée.')
    if (key.expiresAt && key.expiresAt <= new Date()) {
      throw new ApiError('unauthorized', 'Clé API expirée.')
    }

    // La date de dernière utilisation (CDS 6.4) n'a pas besoin d'être exacte
    // à la seconde : une écriture par minute et par clé suffit.
    const now = Date.now()
    if (now - (lastKeyTouch.get(key.id) ?? 0) > 60_000) {
      lastKeyTouch.set(key.id, now)
      if (lastKeyTouch.size > 5_000) lastKeyTouch = new Map([[key.id, now]])
      void prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)
    }

    return {
      kind: 'apiKey',
      user: null,
      apiKey: {
        id: key.id,
        name: key.name,
        projectId: key.projectId,
        permissions: key.permissions.filter(isPermission),
      },
      actor: actorFromRequest(request, { apiKeyId: key.id }),
    }
  }

  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw new ApiError('unauthorized', 'Authentification requise.')
  const user = session.user as typeof session.user & { role: GlobalRoleName; status: string }
  if (user.status !== 'ACTIVE') throw new ApiError('unauthorized', 'Compte suspendu.')
  assertSameOrigin(request)

  return {
    kind: 'user',
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    apiKey: null,
    actor: actorFromRequest(request, { userId: user.id }),
  }
}

/** Projet désigné par la requête : celui de la clé, ou `X-Project` pour une session. */
function projectRef(request: Request): string | null {
  return request.headers.get('x-project') ?? new URL(request.url).searchParams.get('project')
}

export async function resolveProject(caller: Caller, ref: string | null): Promise<{
  project: ProjectWithProvider
  permissions: Permission[]
}> {
  if (caller.apiKey) {
    const project = await prisma.project.findUnique({
      where: { id: caller.apiKey.projectId },
      include: { provider: true },
    })
    if (!project) throw new ApiError('unauthorized', 'Projet de la clé introuvable.')
    // Une clé ne sert que son projet : désigner un autre projet est une erreur
    // de configuration chez le client, pas un moyen d'en changer.
    if (ref && ref !== project.publicId) {
      throw new ApiError('forbidden', 'Cette clé n’est pas valable pour ce projet.')
    }
    return { project, permissions: caller.apiKey.permissions }
  }

  if (!ref) throw new ApiError('bad_request', 'Projet non précisé (en-tête X-Project).')
  const project = await prisma.project.findUnique({ where: { publicId: ref }, include: { provider: true } })
  const user = caller.user!
  const membership = project
    ? await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: user.id } },
      })
    : null
  const permissions = project ? permissionsFor(user.role, (membership?.role as ProjectRoleName) ?? null) : []
  // Un projet auquel on n'a pas accès est présenté comme inexistant : la
  // réponse ne doit pas confirmer qu'un identifiant est valide.
  if (!project || permissions.length === 0) throw new ApiError('not_found', 'Projet introuvable.')
  return { project, permissions }
}

export async function authenticate(request: Request, options: { rateLimit?: 'api' | 'links' } = {}): Promise<ApiContext> {
  const caller = await identify(request)
  const { project, permissions } = await resolveProject(caller, projectRef(request))

  const who = caller.apiKey ? `key:${caller.apiKey.id}` : `user:${caller.user!.id}`
  const limit = rateLimit(`api:${who}:${project.id}`, project.rateLimitPerMinute)
  if (!limit.allowed) {
    throw new ApiError('rate_limited', 'Trop de requêtes. Réessayez dans un instant.', undefined, {
      'Retry-After': String(limit.resetIn),
      'X-RateLimit-Limit': String(limit.limit),
      'X-RateLimit-Remaining': '0',
    })
  }
  if (options.rateLimit === 'links') {
    const links = rateLimit(`links:${who}:${project.id}`, project.signedUrlPerMinute)
    if (!links.allowed) {
      throw new ApiError('rate_limited', 'Trop de liens créés. Réessayez dans un instant.', undefined, {
        'Retry-After': String(links.resetIn),
      })
    }
  }
  recordUsage(project.id, { requests: 1 })

  const granted = new Set(permissions)
  return {
    ...caller,
    project,
    permissions: granted,
    can: (permission) => granted.has(permission),
    require: (...needed) => {
      const missing = needed.filter((permission) => !granted.has(permission))
      if (missing.length > 0) {
        throw new ApiError('forbidden', `Permission manquante : ${missing.join(', ')}.`, { missing })
      }
    },
  }
}

/**
 * Enveloppe d'une route : toute erreur repart au format commun, et le
 * travail d'arrière-plan est mené à terme après la réponse en fonctions.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    if (isServerless) after(drainBackground)
    try {
      return await fn(...args)
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

export function ok(data: Record<string, unknown>, init?: ResponseInit): Response {
  return Response.json({ success: true, ...data }, init)
}

/** Corps JSON de la requête ; un corps illisible est une erreur du client. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError('bad_request', 'Corps de requête JSON attendu.')
  }
}

export type Params<T extends Record<string, string>> = { params: Promise<T> }
