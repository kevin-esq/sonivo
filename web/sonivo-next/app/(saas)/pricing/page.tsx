import { headers } from 'next/headers'
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

export default async function PricingPage() {
  const rawLocale = (await headers()).get('x-locale')
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const dictionary = await getDictionary(locale)

  return (
    <main className="space-y-4">
      <h1 className="text-3xl font-bold">{dictionary['pricing.title']}</h1>
      <p>{dictionary['pricing.body']}</p>
    </main>
  )
}
