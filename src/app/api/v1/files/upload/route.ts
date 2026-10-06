import { authenticate, handle, ok } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { fileDto } from '@/lib/api/serialize'
import { uploadFields, uploadFile } from '@/lib/services/files'

/**
 * Au-delà, le corps entier tiendrait en mémoire du serveur le temps de
 * l'envoi : les gros fichiers passent par une session reprenable (CDS 12).
 */
const SIMPLE_UPLOAD_LIMIT = 100 * 1024 * 1024

/** `waveform` arrive en multipart sous forme de liste : « 12,40,73,… ». */
function parseWaveform(value: FormDataEntryValue | null): number[] | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  return value.split(',').map((item) => Number(item.trim()))
}

/**
 * POST /api/v1/files/upload (CDS 11)
 *
 * Corps `multipart/form-data` : `file` (obligatoire), `folderId`, `name`,
 * `durationSeconds`, `width`, `height`, `waveform`.
 */
export const POST = handle(async (request: Request) => {
  const ctx = await authenticate(request)
  ctx.require('files:upload')

  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > SIMPLE_UPLOAD_LIMIT + 64 * 1024) {
    throw new ApiError(
      'payload_too_large',
      'Fichier trop volumineux pour un envoi simple : utilisez /api/v1/uploads (envoi reprenable).',
    )
  }

  const form = await request.formData().catch(() => {
    throw new ApiError('bad_request', 'Corps multipart/form-data attendu.')
  })
  const file = form.get('file')
  if (!(file instanceof File)) throw new ApiError('bad_request', 'Champ « file » manquant.')
  if (file.size > SIMPLE_UPLOAD_LIMIT) {
    throw new ApiError('payload_too_large', 'Fichier trop volumineux pour un envoi simple : utilisez /api/v1/uploads.')
  }

  const fields = uploadFields.parse({
    folderId: form.get('folderId') || undefined,
    name: form.get('name') || undefined,
    durationSeconds: form.get('durationSeconds') || undefined,
    width: form.get('width') || undefined,
    height: form.get('height') || undefined,
    waveform: parseWaveform(form.get('waveform')),
  })

  const stored = await uploadFile(ctx.project, ctx.actor, {
    ...fields,
    fileName: file.name,
    declaredMime: file.type,
    data: new Uint8Array(await file.arrayBuffer()),
  })
  return ok({ file: fileDto(stored) }, { status: 201 })
})
