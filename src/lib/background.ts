import { flushUsage } from '@/lib/services/usage'

/**
 * Travail d'arrière-plan d'une requête : envois de webhooks, compteurs
 * d'usage.
 *
 * Sur un serveur permanent, il se termine de lui-même. Sur un hébergement en
 * fonctions (Vercel), la fonction peut être gelée dès la réponse envoyée : ce
 * travail serait perdu. Les routes appellent donc `drainBackground` après la
 * réponse, par `after()` de Next.js, pour le mener à terme.
 */
const pending = new Set<Promise<unknown>>()

export function track(promise: Promise<unknown>) {
  pending.add(promise)
  void promise.finally(() => pending.delete(promise))
}

export async function drainBackground() {
  await Promise.allSettled([...pending])
  await flushUsage()
}

/** Vrai sur un hébergement en fonctions, où rien ne survit à la réponse. */
export const isServerless = Boolean(process.env.VERCEL)
