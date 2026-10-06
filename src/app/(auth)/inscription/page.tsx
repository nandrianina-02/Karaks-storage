import type { Metadata } from 'next'
import { Suspense } from 'react'

import { SignUpForm } from '@/components/auth/auth-forms'
import { isGoogleConfigured } from '@/lib/env'

export const metadata: Metadata = { title: 'Créer un compte' }

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm google={isGoogleConfigured} />
    </Suspense>
  )
}
