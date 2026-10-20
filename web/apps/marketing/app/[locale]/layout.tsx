import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { isLocale } from '@sonivo/i18n/config'
import { notFound } from 'next/navigation'
import '../styles.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://sonivo.lat'),
  applicationName: 'Sonivo',
  robots: { index: true, follow: true },
}

export default async function LocalizedMarketingLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  )
}
