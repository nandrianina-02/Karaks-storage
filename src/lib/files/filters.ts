/**
 * Recherche avancée de l'explorateur (CDS V2) : type, taille, date d'ajout,
 * portée. Les filtres vivent dans l'adresse, en valeurs lisibles, pour qu'une
 * recherche se partage ou se garde en favori ; ce module les traduit en
 * critères pour `listFiles`, côté serveur comme côté client.
 */
export const TYPE_FILTERS = [
  { value: 'audio', label: 'Audio' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Vidéos' },
  { value: 'document', label: 'Documents' },
] as const
export type TypeFilter = (typeof TYPE_FILTERS)[number]['value']

const MB = 1024 * 1024

export const SIZE_FILTERS = [
  { value: 'moins-1', label: 'Moins de 1 Mo', min: undefined, max: MB },
  { value: '1-10', label: '1 à 10 Mo', min: MB, max: 10 * MB },
  { value: '10-100', label: '10 à 100 Mo', min: 10 * MB, max: 100 * MB },
  { value: 'plus-100', label: 'Plus de 100 Mo', min: 100 * MB, max: undefined },
] as const
export type SizeFilter = (typeof SIZE_FILTERS)[number]['value']

export const ADDED_FILTERS = [
  { value: '24h', label: 'Dernières 24 heures', days: 1 },
  { value: '7j', label: '7 derniers jours', days: 7 },
  { value: '30j', label: '30 derniers jours', days: 30 },
  { value: '1an', label: 'Douze derniers mois', days: 365 },
  { value: 'plage', label: 'Période précise', days: null },
] as const
export type AddedFilter = (typeof ADDED_FILTERS)[number]['value']

export interface FileFilters {
  type: TypeFilter | null
  size: SizeFilter | null
  added: AddedFilter | null
  /** Bornes de la période précise, au format AAAA-MM-JJ. */
  from: string | null
  to: string | null
  /** Vrai : la recherche reste dans le dossier ouvert. */
  inFolder: boolean
}

type Read = (name: string) => string | undefined

const DATE = /^\d{4}-\d{2}-\d{2}$/

function pick<T extends string>(value: string | undefined, allowed: readonly { value: T }[]): T | null {
  return allowed.find((item) => item.value === value)?.value ?? null
}

export function parseFilters(read: Read): FileFilters {
  const added = pick(read('ajout'), ADDED_FILTERS)
  const from = read('du')
  const to = read('au')
  return {
    type: pick(read('type'), TYPE_FILTERS),
    size: pick(read('taille'), SIZE_FILTERS),
    added,
    from: added === 'plage' && from && DATE.test(from) ? from : null,
    to: added === 'plage' && to && DATE.test(to) ? to : null,
    inFolder: read('portee') === 'dossier',
  }
}

/** Nombre de filtres actifs, pour le compteur du bouton. */
export function activeFilterCount(filters: FileFilters): number {
  return [filters.type, filters.size, filters.added].filter(Boolean).length
}

/** Critères de `listFiles` correspondants. */
export function filterCriteria(filters: FileFilters, now = Date.now()) {
  const size = SIZE_FILTERS.find((item) => item.value === filters.size)
  const added = ADDED_FILTERS.find((item) => item.value === filters.added)
  let from: Date | undefined
  let to: Date | undefined
  if (added?.days) from = new Date(now - added.days * 86_400_000)
  if (added?.value === 'plage') {
    if (filters.from) from = new Date(`${filters.from}T00:00:00`)
    // La borne de fin couvre toute la journée choisie.
    if (filters.to) to = new Date(`${filters.to}T23:59:59.999`)
  }
  return {
    category: filters.type ?? undefined,
    minSize: size?.min,
    maxSize: size?.max,
    from,
    to,
  }
}
