import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { getPublicBranding } from '@sonivo/api-client/branding'
import { DEFAULT_LOCALE, isLocale } from '@sonivo/i18n/config'
import { themeVars } from '@sonivo/ui/vars'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sonivo',
  description: 'Group music management.',
  icons: { icon: '/favicon.svg' },
}

/**
 * Root layout. Injects the group branding as CSS variables from the server and
 * loads the UI/display fonts used by the product (same set as the Vite shell).
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers()
  const tenant = requestHeaders.get('x-tenant-slug')
  const rawLocale = requestHeaders.get('x-locale')
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE

  const branding = tenant ? await getPublicBranding(tenant) : null
  if (tenant && !branding) {
    notFound()
  }

  return (
    <html lang={locale} data-theme={branding?.themeDefault ?? 'system'} style={themeVars(branding)}>
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
