import { authenticate, handle, ok, readJson, type Params } from '@/lib/api/context'
import { linkDto } from '@/lib/api/serialize'
import { createLink, createLinkInput } from '@/lib/services/links'

/**
 * POST /api/v1/files/:id/signed-url (CDS 15)
 *
 *   { "type": "stream", "expiresIn": 600, "maxUses": 1 }
 *
 * L'adresse n'est renvoyée qu'ici : la base n'en garde que l'empreinte.
 */
export const POST = handle(async (request: Request, { params }: Params<{ id: string }>) => {
  const ctx = await authenticate(request, { rateLimit: 'links' })
  ctx.require('links:create')
  const input = createLinkInput.parse(await readJson(request))
  // Un lien de téléchargement donne le droit de télécharger : la clé qui le
  // crée doit déjà avoir ce droit, sans quoi elle s'en fabriquerait un.
  ctx.require(input.type === 'download' ? 'download:read' : 'stream:read')
  const { link, file, url } = await createLink(ctx.project, (await params).id, input, ctx.actor)
  return ok(
    { url, expiresAt: link.expiresAt.toISOString(), link: linkDto({ ...link, file }) },
    { status: 201 },
  )
})
