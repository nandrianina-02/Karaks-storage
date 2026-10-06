import type { Metadata } from 'next'

import { ForgotPasswordForm } from '@/components/auth/auth-forms'

export const metadata: Metadata = { title: 'Mot de passe oublié' }

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
