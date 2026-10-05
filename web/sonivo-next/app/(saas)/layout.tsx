import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { I18nProvider } from '@/lib/i18n/I18nProvider'

/** Apex (marketing/auth) layout: provides i18n for the public SaaS surfaces. */
export default async function SaasLayout({ children }: { children: ReactNode }) {
  const rawLocale = (await headers()).get('x-locale')
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const dictionary = await getDictionary(locale)

  return (
    <I18nProvider locale={locale} dictionary={dictionary}>
      <div className="mx-auto max-w-3xl px-4 py-10">{children}</div>
    </I18nProvider>
  )
}
