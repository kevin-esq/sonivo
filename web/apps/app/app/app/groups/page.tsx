import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ProductGroupsContent } from './ProductGroupsContent'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function ProductGroupsPage() {
  return (
    <Suspense fallback={<main aria-busy="true" />}>
      <ProductGroupsContent />
    </Suspense>
  )
}
