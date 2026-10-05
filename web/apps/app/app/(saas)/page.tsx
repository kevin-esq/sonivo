import Link from 'next/link'
import { headers } from 'next/headers'
import { DEFAULT_LOCALE, isLocale } from '@sonivo/i18n/config'
import { getDictionary } from '@sonivo/i18n/dictionaries'

export default async function LandingPage() {
  const rawLocale = (await headers()).get('x-locale')
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const dictionary = await getDictionary(locale)

  return (
    <main className="space-y-6 text-center">
      <h1 className="text-4xl font-bold" style={{ color: 'var(--color-primary)' }}>
        {dictionary['common.appName']}
      </h1>
      <p className="text-lg">{dictionary['marketing.tagline']}</p>
      <div className="flex justify-center gap-3">
        <Link
          href="/login"
          className="rounded-full px-5 py-2 font-semibold"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          {dictionary['marketing.login']}
        </Link>
        <Link href="/pricing" className="rounded-full border px-5 py-2 font-semibold">
          {dictionary['marketing.pricing']}
        </Link>
      </div>
    </main>
  )
}
