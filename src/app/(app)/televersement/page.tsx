import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { UploadPage } from '@/components/upload/upload-page'
import { env } from '@/lib/env'
import { requireProject } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Upload' }

export default async function UploadRoute() {
  const workspace = await requireProject()
  if (!workspace.can('files:upload')) redirect('/fichiers')
  const { project } = workspace
  return (
    <UploadPage
      project={project.publicId}
      maxFileSize={Math.min(Number(project.maxFileSize), env.STORAGE_MAX_FILE_SIZE)}
    />
  )
}
