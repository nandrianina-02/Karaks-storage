'use client'

/**
 * Appels de l'API depuis le tableau de bord.
 *
 * Le tableau de bord consomme la même API que Karaks : ce qui marche ici
 * marche pour un client externe. La session tient lieu de clé, et le projet
 * est désigné par `X-Project`.
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
  }
}

export async function api<T = Record<string, unknown>>(
  path: string,
  options: { method?: string; body?: unknown; project?: string | null; signal?: AbortSignal; headers?: HeadersInit } = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.project) headers.set('X-Project', options.project)
  let body: BodyInit | undefined
  if (options.body !== undefined) {
    if (options.body instanceof Blob || options.body instanceof ArrayBuffer || options.body instanceof Uint8Array) {
      body = options.body as BodyInit
    } else {
      headers.set('Content-Type', 'application/json')
      body = JSON.stringify(options.body)
    }
  }
  const response = await fetch(path, { method: options.method ?? 'GET', headers, body, signal: options.signal })
  const payload = (await response.json().catch(() => null)) as
    | ({ success?: boolean; error?: { code: string; message: string; details?: { message: string }[] } } & T)
    | null
  if (!response.ok) {
    const detail = payload?.error?.details?.[0]?.message
    throw new ApiClientError(
      detail ? `${payload?.error?.message} ${detail}` : payload?.error?.message ?? 'La requête a échoué.',
      response.status,
      payload?.error?.code ?? 'internal_error',
    )
  }
  return payload as T
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error && error.name === 'AbortError') return 'Opération annulée.'
  return 'Le service ne répond pas. Vérifiez votre connexion.'
}

/** Adresses du tableau de bord pour lire un fichier : la session vaut clé. */
export function streamUrl(project: string, fileId: string) {
  return `/api/v1/files/${fileId}/stream?project=${encodeURIComponent(project)}`
}

export function downloadUrl(project: string, fileId: string) {
  return `/api/v1/files/${fileId}/download?project=${encodeURIComponent(project)}`
}
