import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sonivo',
  description: 'Group music management.',
  icons: { icon: '/favicon.svg' },
}

/**
 * Root layout. Static so the app can be exported for the single-origin .NET host.
 * Theme and group branding are applied client-side by the ported providers, as
 * in the previous Vite shell.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Inter:wght@400;600;700&family=DM+Sans:wght@400;600;700&family=Poppins:wght@400;600;700&family=Nunito:wght@400;600;700&family=Space+Grotesk:wght@400;600;700&family=Source+Serif+4:wght@400;600;700&family=Lora:wght@400;600;700&family=Playfair+Display:wght@400;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
