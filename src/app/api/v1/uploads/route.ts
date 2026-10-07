import { authenticate, handle, ok, readJson } from '@/lib/api/context'
import { CHUNK_GRANULARITY, CHUNK_SIZE } from '@/lib/storage/provider'
import { createUpload, createUploadInput, uploadDto } from '@/lib/services/uploads'

/**
 * POST /api/v1/uploads — ouvre une session reprenable (CDS 12).
 *
 *   { "name": "song.mp3", "mimeType": "audio/mpeg", "size": 52428800, "folderId": "fld_…" }
 *
 * Le client envoie ensuite le fichier par morceaux :
 *   PUT /api/v1/uploads/:id  avec  Content-Range: bytes 0-4194303/52428800
 *
 * Ou, depuis un navigateur qui ne doit pas détenir la clé : PUT sur
 * `uploadUrl`, une adresse à jeton propre à cette session (/u/:id?t=…).
 */
export const POST = handle(async (request: Request) => {
  const ctx = await authenticate(request)
  ctx.require('files:upload')
  const input = createUploadInput.parse(await readJson(request))
  const { session, uploadUrl } = await createUpload(ctx.project, ctx.actor, input)
  return ok(
    {
      upload: uploadDto(session, 0),
      // Adresse à remettre au navigateur : il y envoie les morceaux sans clé.
      uploadUrl,
      chunkSize: CHUNK_SIZE,
      chunkGranularity: CHUNK_GRANULARITY,
    },
    { status: 201 },
  )
})
