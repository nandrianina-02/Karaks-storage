/**
 * Modèle de permissions (CDS 16, 17).
 *
 * Une clé API porte une liste explicite de permissions. Un compte, lui, tient
 * les siennes de son rôle dans le projet. Les deux passent par la même
 * vérification, si bien qu'une route n'a pas à savoir qui l'appelle.
 */
export const PERMISSIONS = [
  'files:read',
  'files:upload',
  'files:update',
  'files:delete',
  'stream:read',
  'download:read',
  'folders:read',
  'folders:write',
  'links:create',
  'links:revoke',
  'stats:read',
  'api-keys:manage',
  'webhooks:manage',
  'logs:read',
  'project:manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const PERMISSION_LABELS: Record<Permission, string> = {
  'files:read': 'Lire la liste et les métadonnées des fichiers',
  'files:upload': 'Téléverser des fichiers',
  'files:update': 'Renommer et déplacer des fichiers',
  'files:delete': 'Mettre à la corbeille et supprimer',
  'stream:read': 'Diffuser en lecture continue',
  'download:read': 'Télécharger',
  'folders:read': 'Lire les dossiers',
  'folders:write': 'Créer, renommer et supprimer des dossiers',
  'links:create': 'Créer des liens temporaires',
  'links:revoke': 'Révoquer des liens temporaires',
  'stats:read': 'Consulter les statistiques',
  'api-keys:manage': 'Gérer les clés API',
  'webhooks:manage': 'Gérer les webhooks',
  'logs:read': 'Consulter le journal',
  'project:manage': 'Modifier les réglages du projet',
}

/**
 * Permissions qu'une clé API peut recevoir. Gérer les clés ou le projet
 * depuis une clé permettrait à une clé compromise de se multiplier ou de
 * s'élever : ces droits restent réservés aux comptes du tableau de bord.
 */
export const API_KEY_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (permission) => permission !== 'api-keys:manage' && permission !== 'project:manage',
)

/** Préréglage proposé par défaut : ce dont une application comme Karaks a besoin. */
export const DEFAULT_KEY_PERMISSIONS: Permission[] = [
  'files:read',
  'files:upload',
  'folders:read',
  'stream:read',
  'download:read',
  'links:create',
]

export type ProjectRoleName = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER'

const READ_ONLY: Permission[] = [
  'files:read',
  'folders:read',
  'stream:read',
  'download:read',
  'stats:read',
]

export const ROLE_PERMISSIONS: Record<ProjectRoleName, Permission[]> = {
  OWNER: [...PERMISSIONS],
  ADMIN: [...PERMISSIONS],
  DEVELOPER: PERMISSIONS.filter((permission) => permission !== 'project:manage'),
  VIEWER: READ_ONLY,
}

export type GlobalRoleName = 'SUPER_ADMIN' | 'ADMIN' | 'DEVELOPER' | 'USER' | 'SERVICE'

/**
 * Permissions d'un compte sur un projet. Le super administrateur a tout
 * partout ; les autres comptes n'ont que ce que leur rôle dans le projet
 * leur donne, y compris un administrateur global, qui gère les comptes mais
 * n'entre pas dans les projets dont il n'est pas membre.
 */
export function permissionsFor(
  globalRole: GlobalRoleName,
  projectRole: ProjectRoleName | null,
): Permission[] {
  if (globalRole === 'SUPER_ADMIN') return [...PERMISSIONS]
  return projectRole ? ROLE_PERMISSIONS[projectRole] : []
}

/** Création de projets : réservée aux administrateurs (CDS 39). */
export function canCreateProject(globalRole: GlobalRoleName): boolean {
  return globalRole === 'SUPER_ADMIN' || globalRole === 'ADMIN'
}

export function canManageUsers(globalRole: GlobalRoleName): boolean {
  return globalRole === 'SUPER_ADMIN' || globalRole === 'ADMIN'
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value)
}
