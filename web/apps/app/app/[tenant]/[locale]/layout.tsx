import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { getPublicBranding } from '@sonivo/api-client/branding'
import { isLocale, type Locale } from '@sonivo/i18n/config'
import { getDictionary } from '@sonivo/i18n/dictionaries'
import { I18nProvider } from '@sonivo/i18n/I18nProvider'

type TenantParams = { tenant: string; locale: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<TenantParams>
}): Promise<Metadata> {
  const { tenant } = await params
  const branding = await getPublicBranding(tenant)
  if (!branding) return {}
  return {
    title: branding.name ?? 'Sonivo',
    icons: branding.logoUrl ? { icon: branding.logoUrl } : undefined,
  }
}

/**
 * Tenant layout: validates the slug/locale, provides the active dictionary and
 * the tenant navigation. Theme variables are injected in the root layout.
 */
export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<TenantParams>
}) {
  const { tenant, locale: rawLocale } = await params
  if (!isLocale(rawLocale)) {
    notFound()
  }

  const locale: Locale = rawLocale
  const branding = await getPublicBranding(tenant)
  if (!branding) {
    notFound()
  }

  const dictionary = await getDictionary(locale)

  return (
    <I18nProvider locale={locale} dictionary={dictionary}>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6 flex items-center justify-between">
          <span className="text-lg font-semibold" style={{ color: 'var(--color-primary)' }}>
            {branding.name ?? 'Sonivo'}
          </span>
          <nav className="flex gap-4 text-sm">
            <a href={`/${tenant}/${locale}`}>{dictionary['nav.home']}</a>
            <a href={`/${tenant}/${locale}/rehearsals`}>{dictionary['nav.rehearsals']}</a>
            <a href={`/${tenant}/${locale}/repertoire`}>{dictionary['nav.repertoire']}</a>
          </nav>
        </header>
        {children}
      </div>
    </I18nProvider>
  )
}
