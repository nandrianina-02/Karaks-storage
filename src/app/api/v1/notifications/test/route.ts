import { handle, identify, ok } from '@/lib/api/context'
import { ApiError } from '@/lib/api/errors'
import { checkEmail } from '@/lib/email'
import { notifyUserNow } from '@/lib/services/email-notifications'

/** POST /api/v1/notifications/test — email d'essai au super administrateur qui le demande. */
export const POST = handle(async (request: Request) => {
  const caller = await identify(request)
  if (caller.user?.role !== 'SUPER_ADMIN') throw new ApiError('forbidden', 'Réservé au super administrateur.')
  const status = await checkEmail(true)
  if (!status.configured) throw new ApiError('bad_request', status.detail)
  if (!status.ok) throw new ApiError('storage_unavailable', `Serveur SMTP injoignable : ${status.detail}`)
  const result = await notifyUserNow(caller.user.id, 'security', (user) => ({
    subject: 'Email d’essai de Karaks Storage',
    preheader: 'L’envoi des emails fonctionne.',
    title: 'L’envoi des emails fonctionne',
    paragraphs: [`Bonjour ${user.name.split(' ')[0]},`, 'Ce message confirme que Karaks Storage peut envoyer ses emails : invitations, alertes de sécurité et d’exploitation.'],
    details: [['Serveur', status.detail]],
  }))
  if (!result.sent) throw new ApiError('storage_unavailable', `Envoi refusé : ${'error' in result ? result.error : 'raison inconnue'}`)
  return ok({ sentTo: caller.user.email })
})
