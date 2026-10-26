import type { Metadata } from 'next'
import { RootPageContent } from './RootPageContent'

export const metadata: Metadata = {
  title: 'Sonivo — música en perfecta sintonía',
  description: 'Canciones, ensayos y eventos conectados para que todo tu grupo llegue preparado.',
  robots: process.env.NEXT_EXPORT === '1'
    ? { index: false, follow: false }
    : { index: true, follow: true },
}

export default function Page() {
  return <RootPageContent />
}
