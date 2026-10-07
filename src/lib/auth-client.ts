'use client'

import { inferAdditionalFields, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import type { auth } from '@/lib/auth'

export const authClient = createAuthClient({
  basePath: '/api/v1/auth',
  plugins: [inferAdditionalFields<typeof auth>(), twoFactorClient()],
})
