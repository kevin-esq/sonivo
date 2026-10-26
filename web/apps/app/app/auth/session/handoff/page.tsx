import { Suspense } from 'react'
import type { Metadata } from 'next'
import { HandoffPage } from '@/src/tenancy/HandoffPage'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function SessionHandoffPage() {
  return (
    <Suspense fallback={<main aria-busy="true" />}>
      <HandoffPage />
    </Suspense>
  )
}
