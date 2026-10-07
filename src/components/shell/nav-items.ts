import {
  Activity,
  ChartColumn,
  CirclePlay,
  CloudUpload,
  FolderClosed,
  FolderOpen,
  House,
  KeyRound,
  Layers,
  Link2,
  ScrollText,
  Settings,
  Webhook,
  type LucideIcon,
} from 'lucide-react'

import type { Permission } from '@/lib/security/permissions'

/** Navigation principale, dans l'ordre et avec les libellés de la maquette. */
export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  permission?: Permission
  /** Réservée au super administrateur. */
  superAdmin?: boolean
  /** Préfixes qui gardent l'entrée active (pages de détail). */
  match?: string[]
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: House },
  { href: '/fichiers', label: 'Fichiers', icon: FolderOpen, permission: 'files:read' },
  { href: '/dossiers', label: 'Dossiers', icon: FolderClosed, permission: 'folders:read' },
  { href: '/televersement', label: 'Upload', icon: CloudUpload, permission: 'files:upload' },
  { href: '/lectures', label: 'En lecture', icon: CirclePlay, permission: 'stream:read' },
  { href: '/liens', label: 'URLs temporaires', icon: Link2, permission: 'files:read' },
  { href: '/cles-api', label: 'API Keys', icon: KeyRound, permission: 'api-keys:manage' },
  { href: '/webhooks', label: 'Webhooks', icon: Webhook, permission: 'webhooks:manage' },
  { href: '/statistiques', label: 'Analytics', icon: ChartColumn, permission: 'stats:read' },
  { href: '/projets', label: 'Projets', icon: Layers },
  { href: '/journal', label: 'Logs', icon: ScrollText, permission: 'logs:read' },
  { href: '/supervision', label: 'Supervision', icon: Activity, superAdmin: true },
  { href: '/parametres', label: 'Paramètres', icon: Settings, match: ['/profil'] },
]

/** Entrées visibles selon les permissions sur le projet et le rôle global. */
export function visibleNav(permissions: Iterable<Permission>, superAdmin: boolean): NavItem[] {
  const granted = new Set(permissions)
  return NAV_ITEMS.filter((item) => (!item.permission || granted.has(item.permission)) && (!item.superAdmin || superAdmin))
}
