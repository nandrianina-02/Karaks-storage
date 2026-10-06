import { openApiDocument } from '@/lib/docs/endpoints'
import { appUrl } from '@/lib/env'

/** GET /api/v1/openapi.json — description OpenAPI 3.1 de l'API (CDS 6.5). */
export function GET() {
  return Response.json(openApiDocument(appUrl), { headers: { 'Cache-Control': 'public, max-age=300' } })
}
