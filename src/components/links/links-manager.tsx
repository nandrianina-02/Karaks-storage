'use client'

import { Ban, Download, Link2, Plus, Radio, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import { FileDialogs, type FileDialog } from '@/components/files/file-dialogs'
import { FileIcon } from '@/components/files/file-icon'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/field'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/surface'
import { useToast } from '@/components/ui/toast'
import type { FileDto, LinkDto, LinkStatus } from '@/lib/api/serialize'
import { api, errorMessage } from '@/lib/client/api'
import { categoryOf, formatBytes } from '@/lib/files/types'
import { cn, formatDate, formatRelative } from '@/lib/utils'

const TABS: { value: LinkStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actifs' },
  { value: 'expired', label: 'Expirés' },
  { value: 'exhausted', label: 'Épuisés' },
  { value: 'revoked', label: 'Révoqués' },
]

const STATUS: Record<LinkStatus, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' }> = {
  active: { label: 'Actif', tone: 'success' },
  expired: { label: 'Expiré', tone: 'neutral' },
  exhausted: { label: 'Épuisé', tone: 'warning' },
  revoked: { label: 'Révoqué', tone: 'danger' },
}

/** URLs temporaires (CDS 15) : suivi, révocation et création. */
export function LinksManager({
  project,
  links,
  status,
  canCreate,
  canRevoke,
}: {
  project: string
  links: LinkDto[]
  status: LinkStatus | 'all'
  canCreate: boolean
  canRevoke: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [picking, setPicking] = useState(false)
  const [dialog, setDialog] = useState<FileDialog>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  async function revoke(link: LinkDto) {
    setRevoking(link.id)
    try {
      await api(`/api/v1/links/${link.id}`, { method: 'DELETE', project })
      toast.success('Lien révoqué', 'Il cesse de fonctionner immédiatement.')
      startTransition(() => router.refresh())
    } catch (error) {
      toast.error('Révocation impossible', errorMessage(error))
    } finally {
      setRevoking(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="URLs temporaires"
        description="Liens de lecture ou de téléchargement à durée limitée, révocables à tout moment."
        actions={
          canCreate && (
            <Button variant="primary" icon={<Plus className="h-[18px] w-[18px]" />} onClick={() => setPicking(true)}>
              Nouveau lien
            </Button>
          )
        }
      />

      <Card className={cn('animate-rise stagger-1', pending && 'opacity-70')}>
        <div className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2" role="tablist">
          {TABS.map((tab) => (
            <Link
              key={tab.value}
              href={tab.value === 'all' ? '/liens' : `/liens?statut=${tab.value}`}
              role="tab"
              aria-selected={status === tab.value}
              className={cn(
                '-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
                status === tab.value ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink',
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {links.length === 0 ? (
          <EmptyState
            icon={<Link2 />}
            title="Aucun lien dans cette liste"
            description="Un lien temporaire donne accès à un fichier sans clé API : idéal pour un lecteur audio dans un navigateur ou sur Android."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[0.86rem]">
              <thead>
                <tr className="border-b border-line text-[0.8rem] text-ink-2">
                  <th className="py-3 pl-5 font-medium">Fichier</th>
                  <th className="py-3 font-medium">Usage</th>
                  <th className="py-3 font-medium">Jeton</th>
                  <th className="py-3 font-medium">Utilisations</th>
                  <th className="py-3 font-medium">Expiration</th>
                  <th className="py-3 font-medium">Statut</th>
                  <th className="py-3 pr-5" />
                </tr>
              </thead>
              <tbody>
                {links.map((link, index) => (
                  <tr key={link.id} className={cn('animate-fade border-b border-line last:border-b-0', `stagger-${Math.min(index + 1, 6)}`)}>
                    <td className="max-w-0 py-3 pl-5">
                      <Link href={`/fichiers/${link.fileId}`} className="flex items-center gap-3 hover:underline">
                        <FileIcon category={categoryOf(link.mimeType ?? '')} size="sm" />
                        <span className="truncate text-ink">{link.fileName}</span>
                      </Link>
                    </td>
                    <td className="py-3 text-ink-2">
                      <span className="flex items-center gap-1.5">
                        {link.type === 'download' ? <Download className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
                        {link.type === 'download' ? 'Téléchargement' : 'Lecture'}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-[0.78rem] text-ink-2">/s/{link.hint}…</td>
                    <td className="py-3 text-ink-2 tabular-nums">
                      {link.uses}
                      {link.maxUses !== null && <span className="text-muted"> / {link.maxUses}</span>}
                    </td>
                    <td className="py-3 whitespace-nowrap text-ink-2" title={formatDate(link.expiresAt)}>
                      {formatRelative(link.expiresAt)}
                    </td>
                    <td className="py-3">
                      <Badge tone={STATUS[link.status].tone}>{STATUS[link.status].label}</Badge>
                    </td>
                    <td className="py-3 pr-5 text-right">
                      {canRevoke && link.status === 'active' && (
                        <Button size="sm" variant="danger-ghost" icon={<Ban className="h-3.5 w-3.5" />} loading={revoking === link.id} onClick={() => revoke(link)}>
                          Révoquer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <FilePicker
        open={picking}
        project={project}
        onClose={() => setPicking(false)}
        onPick={(file) => {
          setPicking(false)
          setDialog({ kind: 'link', file })
        }}
      />
      <FileDialogs
        dialog={dialog}
        project={project}
        onClose={() => {
          setDialog(null)
          startTransition(() => router.refresh())
        }}
        onDone={() => undefined}
      />
    </div>
  )
}

function FilePicker({
  open,
  project,
  onClose,
  onPick,
}: {
  open: boolean
  project: string
  onClose: () => void
  onPick: (file: FileDto) => void
}) {
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<FileDto[] | null>(null)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void api<{ files: FileDto[] }>(`/api/v1/files?limit=12&search=${encodeURIComponent(query)}`, { project, signal: controller.signal })
        .then((data) => setFiles(data.files))
        .catch(() => undefined)
    }, 150)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, query, project])

  return (
    <Dialog open={open} onClose={onClose} title="Choisir un fichier" description="Le lien donnera accès à ce fichier seulement." icon={<Search className="h-[18px] w-[18px]" />}>
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher par nom" aria-label="Rechercher un fichier" data-autofocus />
      <ul className="mt-3 max-h-80 space-y-0.5 overflow-y-auto">
        {files === null && <li className="py-6 text-center text-sm text-muted">Chargement...</li>}
        {files?.length === 0 && <li className="py-6 text-center text-sm text-ink-2">Aucun fichier trouvé.</li>}
        {files?.map((file) => (
          <li key={file.id}>
            <button type="button" onClick={() => onPick(file)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2">
              <FileIcon category={file.category} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{file.name}</span>
              <span className="text-xs text-muted">{formatBytes(file.size)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
