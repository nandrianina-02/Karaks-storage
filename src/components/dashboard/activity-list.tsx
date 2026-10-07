import {
  CirclePlay,
  CloudUpload,
  Crown,
  Download,
  FolderPlus,
  KeyRound,
  Layers,
  Link2,
  LogIn,
  Mail,
  PencilLine,
  ShieldAlert,
  Trash2,
  Undo2,
  Unplug,
  UserMinus,
  UserPlus,
  Webhook,
  type LucideIcon,
} from 'lucide-react'

import type { LogItem } from '@/lib/services/logs'
import { cn, formatRelative } from '@/lib/utils'

/** Icône de chaque action du journal, partagée par le tableau de bord et la page Logs. */
export const ACTION_ICONS: Record<string, LucideIcon> = {
  UPLOAD: CloudUpload,
  DOWNLOAD: Download,
  STREAM: CirclePlay,
  UPDATE: PencilLine,
  DELETE: Trash2,
  RESTORE: Undo2,
  DELETE_PERMANENT: Trash2,
  CREATE_FOLDER: FolderPlus,
  DELETE_FOLDER: Trash2,
  CREATE_LINK: Link2,
  REVOKE_LINK: Link2,
  CREATE_API_KEY: KeyRound,
  REVOKE_API_KEY: KeyRound,
  CREATE_PROJECT: Layers,
  UPDATE_PROJECT: Layers,
  DELETE_PROJECT: Trash2,
  CONNECT_PROVIDER: Unplug,
  CREATE_WEBHOOK: Webhook,
  DELETE_WEBHOOK: Webhook,
  LOGIN: LogIn,
  LOGIN_FAILED: ShieldAlert,
  ADD_MEMBER: UserPlus,
  REMOVE_MEMBER: UserMinus,
  INVITE_MEMBER: Mail,
  TRANSFER_OWNERSHIP: Crown,
}

export function ActivityList({ items, empty = 'Aucune activité pour l’instant.' }: { items: LogItem[]; empty?: string }) {
  if (items.length === 0) return <p className="px-5 pb-6 text-sm text-ink-2">{empty}</p>
  return (
    <ul className="px-3 pb-3">
      {items.map((item, index) => {
        const Icon = ACTION_ICONS[item.action] ?? CloudUpload
        const failed = item.result === 'FAILURE'
        return (
          <li key={item.id} className={cn('animate-fade flex items-start gap-3 rounded-lg px-2 py-2', `stagger-${Math.min(index + 1, 6)}`)}>
            <span
              className={cn(
                'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                failed ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-ink-2',
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.84rem] text-ink">
                {item.label}
                {item.target && <span className="text-ink-2"> — {item.target}</span>}
              </p>
              <p className="text-[0.72rem] text-muted">
                {item.actor} · {formatRelative(item.createdAt)}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
