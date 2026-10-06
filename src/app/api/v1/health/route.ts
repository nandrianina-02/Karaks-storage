import { prisma } from '@/lib/prisma'

/**
 * GET /api/v1/health — état du service, pour l'hébergeur.
 *
 * Interroge la base : un service qui répond sans pouvoir lire ses
 * métadonnées n'est pas en état de servir un fichier. Rien de sensible ne
 * sort d'ici.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ status: 'database_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
