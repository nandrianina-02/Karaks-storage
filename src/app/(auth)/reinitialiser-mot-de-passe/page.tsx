import type { Metadata } from 'next'
import { Suspense } from 'react'

import { ResetPasswordForm } from '@/components/auth/auth-forms'

export const metadata: Metadata = { title: 'Nouveau mot de passe' }

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
