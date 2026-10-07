/**
 * Offres (CDS V2 : quotas par offre).
 *
 * Une offre fixe d'un coup les quatre limites d'un projet. Les valeurs sont
 * recopiées sur le projet plutôt que lues ici à chaque requête : changer une
 * offre plus tard ne doit pas modifier en silence les projets déjà ouverts.
 * « Sur mesure » laisse les limites saisies à la main par un super
 * administrateur.
 */
export const PLAN_IDS = ['ESSAI', 'STANDARD', 'PRO', 'SUR_MESURE'] as const
export type PlanId = (typeof PLAN_IDS)[number]

export interface PlanLimits {
  maxFileSize: number
  storageQuota: number | null
  rateLimitPerMinute: number
  signedUrlPerMinute: number
}

const MB = 1024 * 1024
const GB = 1024 * MB

export const PLANS: Record<Exclude<PlanId, 'SUR_MESURE'>, { label: string; summary: string; limits: PlanLimits }> = {
  ESSAI: {
    label: 'Essai',
    summary: 'Pour évaluer le service ou un prototype.',
    limits: { maxFileSize: 50 * MB, storageQuota: 1 * GB, rateLimitPerMinute: 60, signedUrlPerMinute: 20 },
  },
  STANDARD: {
    label: 'Standard',
    summary: 'Une application en production avec un catalogue modeste.',
    limits: { maxFileSize: 200 * MB, storageQuota: 10 * GB, rateLimitPerMinute: 300, signedUrlPerMinute: 60 },
  },
  PRO: {
    label: 'Pro',
    summary: 'Gros catalogue, fort trafic, fichiers vidéo.',
    limits: { maxFileSize: 2 * GB, storageQuota: 100 * GB, rateLimitPerMinute: 1200, signedUrlPerMinute: 300 },
  },
}

export const DEFAULT_PLAN: PlanId = 'STANDARD'

export function planLabel(plan: PlanId): string {
  return plan === 'SUR_MESURE' ? 'Sur mesure' : PLANS[plan].label
}

/** Limites d'une offre, ou `null` pour le sur mesure. */
export function planLimits(plan: PlanId): PlanLimits | null {
  return plan === 'SUR_MESURE' ? null : PLANS[plan].limits
}
