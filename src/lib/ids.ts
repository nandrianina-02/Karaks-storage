import { randomBase62 } from '@/lib/security/crypto'

/**
 * Identifiants publics préfixés (CDS 11 : `file_92kd`).
 *
 * Le préfixe dit la nature de l'objet à qui lit un journal ou une réponse
 * d'API, et évite de passer l'identifiant d'un dossier là où l'on attend
 * celui d'un fichier. Les identifiants internes (cuid) ne sortent pas.
 */
export const ID_PREFIXES = {
  project: 'prj',
  folder: 'fld',
  file: 'file',
  upload: 'upl',
} as const

export type IdKind = keyof typeof ID_PREFIXES

export function newPublicId(kind: IdKind): string {
  return `${ID_PREFIXES[kind]}_${randomBase62(12)}`
}

export function isPublicId(kind: IdKind, value: string): boolean {
  return new RegExp(`^${ID_PREFIXES[kind]}_[0-9A-Za-z]{6,32}$`).test(value)
}
