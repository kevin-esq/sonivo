import type { MetadataRoute } from 'next'
import { LOCALES } from '@sonivo/i18n/config'
import { routes } from '@sonivo/routes'
import { surfaceUrl } from '@sonivo/routes/hosts'

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = {
    'x-default': surfaceUrl('marketing', routes.marketingLocale('es')),
    ...Object.fromEntries(
      LOCALES.map((locale) => [locale, surfaceUrl('marketing', routes.marketingLocale(locale))]),
    ),
  }

  return LOCALES.map((locale) => ({
    url: surfaceUrl('marketing', routes.marketingLocale(locale)),
    changeFrequency: 'monthly',
    priority: locale === 'es' ? 1 : 0.8,
    alternates: { languages },
  }))
}
