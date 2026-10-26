import type { Metadata } from 'next'
import { LegacyFallbackContent } from './LegacyFallbackContent'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function LegacyFallbackPage() {
  return <LegacyFallbackContent />
}
