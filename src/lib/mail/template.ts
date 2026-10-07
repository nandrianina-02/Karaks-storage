/**
 * Mise en page des emails : une colonne, un titre, des paragraphes, au plus
 * une action et un tableau de détails. Chaque message existe aussi en texte
 * brut, que certains lecteurs affichent seul et que les filtres anti-spam
 * comparent à la version HTML.
 *
 * Les couleurs sont écrites ici en dur : un client de messagerie ignore les
 * feuilles de style et les variables CSS. Ce sont les valeurs du thème clair
 * de globals.css, avec le même et unique accent.
 */
const COLORS = {
  page: '#f4f6fb',
  card: '#ffffff',
  ink: '#0f172a',
  ink2: '#475569',
  muted: '#64748b',
  line: '#e2e8f0',
  accent: '#2459e8',
  warning: '#b45309',
}

export interface EmailContent {
  /** Texte d'aperçu affiché par la boîte de réception, sous l'objet. */
  preheader: string
  title: string
  paragraphs: string[]
  action?: { label: string; url: string }
  details?: [string, string][]
  /** Mise en garde finale, par exemple « ce n'était pas vous ? ». */
  note?: string
  /** Pied : raison de l'envoi, et lien de désabonnement s'il y a lieu. */
  footer: { reason: string; unsubscribeUrl?: string }
}

function escape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const FONT = "font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"

export function renderEmail(content: EmailContent): { html: string; text: string } {
  const paragraphs = content.paragraphs
    .map((paragraph) => `<p style="margin:0 0 14px;${FONT};font-size:15px;line-height:1.6;color:${COLORS.ink2}">${escape(paragraph)}</p>`)
    .join('')

  const action = content.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr><td style="border-radius:8px;background:${COLORS.accent}">` +
      `<a href="${escape(content.action.url)}" style="display:inline-block;padding:12px 22px;${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escape(content.action.label)}</a>` +
      `</td></tr></table>` +
      `<p style="margin:10px 0 0;${FONT};font-size:12px;line-height:1.5;color:${COLORS.muted}">Si le bouton ne s’ouvre pas, copiez cette adresse : <span style="word-break:break-all;color:${COLORS.ink2}">${escape(content.action.url)}</span></p>`
    : ''

  const details = content.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0 4px;border-top:1px solid ${COLORS.line}">` +
      content.details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:9px 12px 9px 0;border-bottom:1px solid ${COLORS.line};${FONT};font-size:13px;color:${COLORS.muted};white-space:nowrap;vertical-align:top">${escape(label)}</td>` +
            `<td style="padding:9px 0;border-bottom:1px solid ${COLORS.line};${FONT};font-size:13px;color:${COLORS.ink}">${escape(value)}</td></tr>`,
        )
        .join('') +
      `</table>`
    : ''

  const note = content.note
    ? `<p style="margin:20px 0 0;padding:12px 14px;border-left:3px solid ${COLORS.warning};background:#fffbeb;${FONT};font-size:13px;line-height:1.55;color:${COLORS.ink}">${escape(content.note)}</p>`
    : ''

  const unsubscribe = content.footer.unsubscribeUrl
    ? ` <a href="${escape(content.footer.unsubscribeUrl)}" style="color:${COLORS.muted};text-decoration:underline">Ne plus recevoir ces emails</a>.`
    : ''

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(content.title)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(content.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${COLORS.page}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px">
<tr><td style="padding:0 4px 16px;${FONT};font-size:13px;font-weight:700;letter-spacing:3px;color:${COLORS.ink}">KARAKS <span style="font-weight:500;color:${COLORS.muted}">STORAGE</span></td></tr>
<tr><td style="background:${COLORS.card};border:1px solid ${COLORS.line};border-top:3px solid ${COLORS.accent};border-radius:10px;padding:30px 28px">
<h1 style="margin:0 0 16px;${FONT};font-size:21px;line-height:1.3;font-weight:650;color:${COLORS.ink}">${escape(content.title)}</h1>
${paragraphs}${action}${details}${note}
</td></tr>
<tr><td style="padding:16px 4px 0;${FONT};font-size:12px;line-height:1.55;color:${COLORS.muted}">${escape(content.footer.reason)}${unsubscribe}</td></tr>
</table></td></tr></table></body></html>`

  const text = [
    content.title,
    '',
    ...content.paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(content.action ? [`${content.action.label} : ${content.action.url}`, ''] : []),
    ...(content.details?.length ? [...content.details.map(([label, value]) => `${label} : ${value}`), ''] : []),
    ...(content.note ? [content.note, ''] : []),
    '--',
    content.footer.reason,
    ...(content.footer.unsubscribeUrl ? [`Ne plus recevoir ces emails : ${content.footer.unsubscribeUrl}`] : []),
  ].join('\n')

  return { html, text }
}

/** Date et heure lisibles, dans le fuseau du service (APP_TIMEZONE). */
export function formatWhen(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone }).format(date)
}

/** Résumé lisible d'un agent utilisateur : navigateur et système. */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Appareil inconnu'
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : /node|undici|curl|okhttp|Dart/i.test(userAgent)
              ? 'Programme ou script'
              : 'Navigateur inconnu'
  const system = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad|iOS/.test(userAgent)
      ? 'iOS'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null
  return system ? `${browser} sur ${system}` : browser
}
