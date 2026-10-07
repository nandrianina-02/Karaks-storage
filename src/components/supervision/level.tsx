import { CircleAlert, CircleCheck, CircleX } from 'lucide-react'

import { Badge } from '@/components/ui/surface'
import type { Level } from '@/lib/services/health'

/** Niveau d'un composant : toujours une icône et un mot, jamais la seule couleur. */
export const LEVELS: Record<Level, { label: string; tone: 'success' | 'warning' | 'danger'; icon: typeof CircleCheck }> = {
  ok: { label: 'Opérationnel', tone: 'success', icon: CircleCheck },
  degraded: { label: 'Dégradé', tone: 'warning', icon: CircleAlert },
  down: { label: 'Interrompu', tone: 'danger', icon: CircleX },
}

export function LevelBadge({ level }: { level: Level }) {
  const { label, tone, icon: Icon } = LEVELS[level]
  return (
    <Badge tone={tone} icon={<Icon />}>
      {label}
    </Badge>
  )
}

export const OVERALL: Record<Level, string> = {
  ok: 'Tous les services fonctionnent normalement.',
  degraded: 'Une partie du service fonctionne au ralenti.',
  down: 'Une partie du service est interrompue.',
}
