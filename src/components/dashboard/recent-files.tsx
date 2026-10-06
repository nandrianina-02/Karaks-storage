import Link from 'next/link'

import { FileIcon } from '@/components/files/file-icon'
import { Card, CardHeader } from '@/components/ui/surface'
import type { FileDto } from '@/lib/api/serialize'
import { formatBytes } from '@/lib/files/types'
import { formatRelative } from '@/lib/utils'

export function RecentFiles({ files, className }: { files: FileDto[]; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader
        title="Fichiers récents"
        actions={
          <Link href="/fichiers?tri=createdAt" className="text-[0.8rem] text-accent hover:underline">
            Voir tout
          </Link>
        }
      />
      {files.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-ink-2">Les derniers fichiers téléversés apparaîtront ici.</p>
      ) : (
        <ul className="px-3 pb-3">
          {files.map((file, index) => (
            <li key={file.id} className={`animate-fade stagger-${Math.min(index + 1, 6)}`}>
              <Link href={`/fichiers?fichier=${file.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                <FileIcon category={file.category} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.84rem] text-ink">{file.name}</span>
                  <span className="block text-[0.72rem] text-muted">
                    {formatBytes(file.size)} · {formatRelative(file.createdAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
