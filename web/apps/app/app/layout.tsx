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
}

/**
 * Root layout. It must own <html>/<body> in the App Router, so the tenant theme
 * is injected here from the host resolved by the middleware (ADR-0067). An
 * unknown tenant host renders a neutral 404 — existence is never revealed.
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
      <body>{children}</body>
    </html>
  )
}
