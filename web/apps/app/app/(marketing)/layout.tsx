import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Sonivo — música en perfecta sintonía',
  description: 'Canciones, ensayos y eventos conectados para que todo tu grupo llegue preparado.',
  robots: { index: true, follow: true },
}

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return children
}
