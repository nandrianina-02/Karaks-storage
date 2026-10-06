/**
 * Requêtes de plage HTTP (CDS 13).
 *
 * Le lecteur audio s'en sert pour se déplacer dans un titre sans le
 * télécharger en entier. Une seule plage est servie : les plages multiples
 * (`bytes=0-1,5-9`) ne servent à aucun lecteur média et compliqueraient la
 * réponse (multipart/byteranges) sans bénéfice.
 */
export type RangeResult =
  | { kind: 'full' }
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'unsatisfiable' }

export function parseRange(header: string | null | undefined, size: number): RangeResult {
  if (!header) return { kind: 'full' }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  // En-tête mal formé ou à plages multiples : la norme autorise à l'ignorer
  // et à servir le fichier entier, ce qui reste correct pour le client.
  if (!match) return { kind: 'full' }

  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return { kind: 'full' }
  if (size === 0) return { kind: 'unsatisfiable' }

  // `bytes=-500` : les 500 derniers octets.
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (suffix === 0) return { kind: 'unsatisfiable' }
    return { kind: 'partial', start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = Number(rawStart)
  if (start >= size) return { kind: 'unsatisfiable' }

  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  if (end < start) return { kind: 'unsatisfiable' }

  return { kind: 'partial', start, end }
}

/**
 * Lit l'en-tête `Content-Range` d'un morceau de téléversement :
 * `bytes 0-8388607/52428800`.
 */
export function parseContentRange(
  header: string | null | undefined,
): { start: number; end: number; total: number } | null {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec((header ?? '').trim())
  if (!match) return null
  const [start, end, total] = match.slice(1).map(Number)
  if (end < start || end >= total) return null
  return { start, end, total }
}
