import { authenticate, handle, ok, readJson } from '@/lib/api/context'
import { CHUNK_GRANULARITY, CHUNK_SIZE } from '@/lib/storage/provider'
import { createUpload, createUploadInput, uploadDto } from '@/lib/services/uploads'

/**
 * POST /api/v1/uploads — ouvre une session reprenable (CDS 12).
 *
 *   { "name": "song.mp3", "mimeType": "audio/mpeg", "size": 52428800, "folderId": "fld_…" }
 *
 * Le client envoie ensuite le fichier par morceaux :
 *   PUT /api/v1/uploads/:id  avec  Content-Range: bytes 0-8388607/52428800
 */
export const POST = handle(async (request: Request) => {
  const ctx = await authenticate(request)
  ctx.require('files:upload')
  const input = createUploadInput.parse(await readJson(request))
  const session = await createUpload(ctx.project, ctx.actor, input)
  return ok(
    {
      upload: uploadDto(session, 0),
      chunkSize: CHUNK_SIZE,
      chunkGranularity: CHUNK_GRANULARITY,
    },
    { status: 201 },
  )
})
