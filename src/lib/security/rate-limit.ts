/**
 * Limitation de débit (CDS 25) : fenêtre fixe d'une minute, par clé ou par
 * compte.
 *
 * Sur Vercel, chaque requête peut tomber sur une instance différente : un
 * compteur en mémoire y serait multiplié par le nombre d'instances, et la
 * limite ne tiendrait pas. Le compteur est donc partagé dans Redis dès que
 * `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` sont renseignées
 * (CDS 30). Sans elles, ou si Redis ne répond pas, on retombe sur le compteur
 * local : mieux vaut une limite approximative qu'un service bloqué par la
 * panne d'un composant annexe.
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

/** Compteur local au processus. */
export function rateLimitLocal(
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

const REDIS_TIMEOUT_MS = 800
let redisDownUntil = 0

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  return url && token ? { url: url.replace(/\/$/, ''), token } : null
}

/** Indique si le compteur est partagé entre les instances (page de supervision). */
export function rateLimitBackend(): 'redis' | 'memoire' {
  return redisConfig() ? 'redis' : 'memoire'
}

/**
 * Compteur partagé : la clé porte le numéro de la fenêtre, si bien qu'un
 * `INCR` suffit, sans lecture préalable ni script. L'expiration nettoie
 * derrière.
 */
async function rateLimitRedis(config: { url: string; token: string }, key: string, limit: number, windowMs: number, now: number) {
  const slot = Math.floor(now / windowMs)
  const redisKey = `ks:rl:${key}:${slot}`
  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['INCR', redisKey],
      ['PEXPIRE', redisKey, String(windowMs + 1000)],
    ]),
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Redis a répondu ${response.status}`)
  const [incr] = (await response.json()) as { result?: number; error?: string }[]
  if (typeof incr?.result !== 'number') throw new Error(incr?.error ?? 'Réponse Redis inattendue')
  const count = incr.result
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetIn: Math.max(1, Math.ceil(((slot + 1) * windowMs - now) / 1000)),
  }
}

export async function rateLimit(key: string, limit: number, windowMs = 60_000): Promise<RateLimitResult> {
  const now = Date.now()
  const config = redisConfig()
  // Après une panne, on laisse Redis tranquille trente secondes plutôt que
  // d'ajouter son délai d'attente à chaque requête.
  if (config && now >= redisDownUntil) {
    try {
      return await rateLimitRedis(config, key, limit, windowMs, now)
    } catch (error) {
      redisDownUntil = now + 30_000
      console.warn('[rate-limit] Redis indisponible, compteur local :', error instanceof Error ? error.message : error)
    }
  }
  return rateLimitLocal(key, limit, windowMs, now)
}
