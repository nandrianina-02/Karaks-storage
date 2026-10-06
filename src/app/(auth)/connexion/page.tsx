import type { Metadata } from 'next'
import { Suspense } from 'react'

import { SignInForm } from '@/components/auth/auth-forms'
import { isGoogleConfigured } from '@/lib/env'

export const metadata: Metadata = { title: 'Connexion' }

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm google={isGoogleConfigured} />
    </Suspense>
  )
}
