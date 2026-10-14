/**
 * Règles de bascule entre stockages, sans accès à la base ni au réseau :
 * c'est ce qui se teste (placement.test.ts). Voir services/placement.ts.
 */
export const SEUIL_BASCULE = 0.8

/** Espace d'un stockage : `limit` nul quand aucune limite n'est connue (S3). */
export interface Espace {
  id: string
  usage: number
  limit: number | null
}

/** Vrai si, avec `taille` octets de plus, le stockage dépasse le seuil de bascule. */
export function depasseSeuil(espace: Pick<Espace, 'usage' | 'limit'>, taille: number): boolean {
  return Boolean(espace.limit && espace.usage + taille > espace.limit * SEUIL_BASCULE)
}

/**
 * Parmi `autres`, celui qui garde le plus de place sous le seuil une fois
 * `taille` octets ajoutés ; un stockage sans limite connue passe en tête.
 * `null` si aucun ne convient.
 */
export function choisirAutre(autres: Espace[], taille: number): string | null {
  const candidats = autres
    .filter((espace) => !depasseSeuil(espace, taille))
    .map((espace) => ({ id: espace.id, libre: espace.limit ? espace.limit * SEUIL_BASCULE - espace.usage - taille : Infinity }))
    .sort((a, b) => b.libre - a.libre)
  return candidats[0]?.id ?? null
}
