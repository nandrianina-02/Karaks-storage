import { ZodError } from 'zod'

import { ProviderError } from '@/lib/storage/provider'

/**
 * Erreurs de l'API publique (CDS 6.5 : documentation des erreurs).
 *
 * Toutes les erreurs ont la même forme, et un code stable que le client peut
 * tester sans dépendre du message, rédigé pour un humain :
 *
 *   { "success": false, "error": { "code": "not_found", "message": "…" } }
 */
export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'gone'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'range_not_satisfiable'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'storage_unavailable'
  | 'internal_error'

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  gone: 410,
  payload_too_large: 413,
  unsupported_media_type: 415,
  range_not_satisfiable: 416,
  quota_exceeded: 507,
  rate_limited: 429,
  storage_unavailable: 503,
  internal_error: 500,
}

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get status() {
    return STATUS[this.code]
  }
}

export function errorBody(code: ErrorCode, message: string, details?: unknown) {
  return { success: false, error: { code, message, ...(details ? { details } : {}) } }
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(errorBody(error.code, error.message, error.details), {
      status: error.status,
      headers: error.headers,
    })
  }
  if (error instanceof ZodError) {
    return Response.json(
      errorBody(
        'bad_request',
        'Requête invalide.',
        error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
      ),
      { status: 400 },
    )
  }
  if (error instanceof ProviderError) {
    // Le détail d'une erreur Google n'est pas renvoyé : il peut nommer des
    // identifiants du Drive, qui ne doivent pas sortir (CDS 24).
    console.error('[stockage]', error.message)
    if (error.status === 404) {
      return Response.json(errorBody('not_found', 'Fichier absent du stockage.'), { status: 404 })
    }
    return Response.json(
      errorBody('storage_unavailable', 'Le stockage est momentanément indisponible.'),
      { status: 503 },
    )
  }
  console.error('[api]', error)
  return Response.json(errorBody('internal_error', 'Erreur interne.'), { status: 500 })
}
