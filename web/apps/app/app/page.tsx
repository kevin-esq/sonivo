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
  // NEXT_EXPORT is a server-side build setting. Pass it across the client
  // boundary explicitly so the static SPA bridge is selected in exported
  // deployments instead of hydrating the request-aware marketing page.
  return <RootPageContent isStaticExport={process.env.NEXT_EXPORT === '1'} />
}
