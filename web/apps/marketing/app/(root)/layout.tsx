import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '../styles.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://sonivo.lat'),
  applicationName: 'Sonivo',
  robots: { index: true, follow: true },
}

export default function RootMarketingLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
