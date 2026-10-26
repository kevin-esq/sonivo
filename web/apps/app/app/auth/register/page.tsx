import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AuthPage } from '@/src/auth/AuthPage'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<main aria-busy="true" />}>
      <AuthPage mode="register" />
    </Suspense>
  )
}
