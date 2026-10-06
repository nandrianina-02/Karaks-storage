'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { FileDialogs, type FileDialog } from '@/components/files/file-dialogs'
import { FilePanel, type ProviderInfo } from '@/components/files/file-panel'
import { useToast } from '@/components/ui/toast'
import type { FileDto } from '@/lib/api/serialize'
import { api, errorMessage } from '@/lib/client/api'
import type { Permission } from '@/lib/security/permissions'

/** Fiche d'un fichier (CDS 6.3) : le panneau de détail, en pleine colonne. */
export function FileDetail({
  file,
  project,
  provider,
  permissions,
}: {
  file: FileDto
  project: string
  provider: ProviderInfo
  permissions: Permission[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [dialog, setDialog] = useState<FileDialog>(null)

  async function restore(target: FileDto) {
    try {
      await api(`/api/v1/files/${target.id}/restore`, { method: 'POST', project })
      toast.success('Fichier restauré', target.name)
      startTransition(() => router.refresh())
    } catch (error) {
      toast.error('Restauration impossible', errorMessage(error))
    }
  }

  return (
    <>
      <Link href={file.folderId ? `/fichiers?dossier=${file.folderId}` : '/fichiers'} className="animate-fade mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        Retour aux fichiers
      </Link>
      <FilePanel file={file} project={project} provider={provider} permissions={permissions} onAction={setDialog} onRestore={restore} />
      <FileDialogs
        dialog={dialog}
        project={project}
        onClose={() => setDialog(null)}
        onDone={(change) => {
          if (change.removed?.includes(file.id) && dialog?.kind === 'destroy') router.push('/fichiers')
          else startTransition(() => router.refresh())
        }}
      />
    </>
  )
}
