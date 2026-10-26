import { Suspense } from 'react'
import type { Metadata } from 'next'
import { BrandedLoginAppPage } from '@/src/auth/BrandedLoginAppPage'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export async function generateStaticParams() {
  return [{ slug: 'static-export-fallback' }]
}

export default function BrandedLoginRoutePage() {
  return <Suspense fallback={<main aria-busy="true" />}><BrandedLoginAppPage /></Suspense>
}
