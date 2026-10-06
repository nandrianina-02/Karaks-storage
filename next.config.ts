import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * Le pilote `pg` ouvre des sockets TCP et charge une partie de ses modules
   * dynamiquement. Empaqueté par Turbopack, il établit la connexion puis la
   * perd (« Connection terminated unexpectedly ») : on le laisse être chargé
   * par Node, comme Karaks le fait déjà.
   */
  serverExternalPackages: ['pg', '@prisma/adapter-pg', '@prisma/client'],
}

export default nextConfig
