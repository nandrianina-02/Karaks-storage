/**
 * Limitation de débit en mémoire (CDS 25).
 *
 * Fenêtre fixe d'une minute, par clé ou par compte. Elle est locale au
 * processus : derrière plusieurs instances, chacune compte pour elle. Le
 * service est prévu sur une instance unique ; le passage à plusieurs
 * instances demandera un compteur partagé (`REDIS_URL`, CDS 30). C'est écrit
 * ici plutôt que caché : une limite qui se croit globale sans l'être donne
 * une fausse assurance.
 */
interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()
let lastSweep = 0

function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  /** Secondes avant la réouverture de la fenêtre. */
  resetIn: number
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
  now = Date.now(),
): RateLimitResult {
  sweep(now)
  let window = windows.get(key)
  if (!window || window.resetAt <= now) {
    window = { count: 0, resetAt: now + windowMs }
    windows.set(key, window)
  }
  window.count += 1
  return {
    allowed: window.count <= limit,
    limit,
    remaining: Math.max(0, limit - window.count),
    resetIn: Math.ceil((window.resetAt - now) / 1000),
  }
}

/** Réservé aux tests. */
export function resetRateLimits() {
  windows.clear()
}
