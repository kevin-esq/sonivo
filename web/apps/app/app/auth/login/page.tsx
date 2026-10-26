import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AuthPage } from '@/src/auth/AuthPage'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main aria-busy="true" />}>
      <AuthPage mode="login" />
    </Suspense>
  )
}
