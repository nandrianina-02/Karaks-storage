import { FileText, Film, Folder, ImageIcon, Music } from 'lucide-react'

import type { FileCategory } from '@/lib/files/types'
import { cn } from '@/lib/utils'

/**
 * Pastille de type de fichier. La teinte dit la nature du fichier, l'icône
 * la redit : la couleur seule ne porte jamais l'information.
 */
const STYLES: Record<FileCategory | 'folder', { icon: typeof Music; className: string }> = {
  audio: { icon: Music, className: 'bg-type-audio/15 text-type-audio' },
  image: { icon: ImageIcon, className: 'bg-type-image/15 text-type-image' },
  video: { icon: Film, className: 'bg-type-video/15 text-type-video' },
  document: { icon: FileText, className: 'bg-type-doc/15 text-type-doc' },
  folder: { icon: Folder, className: 'bg-type-folder/15 text-type-folder' },
}

export const CATEGORY_LABELS: Record<FileCategory | 'folder', string> = {
  audio: 'Audio',
  image: 'Image',
  video: 'Vidéo',
  document: 'Document',
  folder: 'Dossier',
}

export function FileIcon({
  category,
  size = 'md',
  className,
}: {
  category: FileCategory | 'folder'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const { icon: Icon, className: tone } = STYLES[category]
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-lg',
        size === 'sm' && 'h-7 w-7 [&>svg]:h-3.5 [&>svg]:w-3.5',
        size === 'md' && 'h-8 w-8 [&>svg]:h-4 [&>svg]:w-4',
        size === 'lg' && 'h-11 w-11 [&>svg]:h-5 [&>svg]:w-5',
        tone,
        className,
      )}
      aria-hidden="true"
    >
      <Icon />
    </span>
  )
}
