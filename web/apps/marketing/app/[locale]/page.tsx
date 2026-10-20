import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDictionary } from '@sonivo/i18n/dictionaries'
import { isLocale, LOCALES, type Locale } from '@sonivo/i18n/config'
import { routes } from '@sonivo/routes'
import { surfaceUrl } from '@sonivo/routes/hosts'

type Props = { params: Promise<{ locale: string }> }

export const dynamicParams = false

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

async function localizedPage(localeParam: string) {
  if (!isLocale(localeParam)) notFound()
  const dictionary = await getDictionary(localeParam)
  return { locale: localeParam as Locale, dictionary }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, dictionary } = await localizedPage((await params).locale)
  const canonical = surfaceUrl('marketing', routes.marketingLocale(locale))
  const languages = {
    'x-default': surfaceUrl('marketing', routes.marketingLocale('es')),
    ...Object.fromEntries(
      LOCALES.map((item) => [item, surfaceUrl('marketing', routes.marketingLocale(item))]),
    ),
  }

  return {
    title: dictionary['marketing.title'],
    description: dictionary['marketing.description'],
    alternates: { canonical, languages },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: 'Sonivo',
      title: dictionary['marketing.title'],
      description: dictionary['marketing.description'],
      locale: { es: 'es_ES', en: 'en_US', pt: 'pt_BR' }[locale],
    },
    twitter: {
      card: 'summary',
      title: dictionary['marketing.title'],
      description: dictionary['marketing.description'],
    },
  }
}

export default async function MarketingPage({ params }: Props) {
  const { locale, dictionary } = await localizedPage((await params).locale)
  const loginUrl = surfaceUrl('identity', routes.login)
  const registerUrl = surfaceUrl('identity', routes.register)

  return (
    <main lang={locale} className="marketing-page">
      <header className="site-header">
        <Link className="brand" href={routes.marketingLocale(locale)} aria-label="Sonivo">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>Sonivo</span>
        </Link>
        <nav aria-label={locale === 'es' ? 'Navegación principal' : locale === 'pt' ? 'Navegação principal' : 'Main navigation'}>
          {LOCALES.map((item) => (
            <Link key={item} href={routes.marketingLocale(item)} hrefLang={item} aria-current={item === locale ? 'page' : undefined}>
              {item.toUpperCase()}
            </Link>
          ))}
          <Link className="nav-login" href={loginUrl}>{dictionary['marketing.secondaryCta']}</Link>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow"><span aria-hidden="true">✦</span> {dictionary['marketing.eyebrow']}</p>
          <h1 id="hero-title">{dictionary['marketing.headline']}</h1>
          <p className="hero-intro">{dictionary['marketing.intro']}</p>
          <div className="hero-actions">
            <Link className="button button-primary" href={registerUrl}>{dictionary['marketing.primaryCta']} <span aria-hidden="true">↗</span></Link>
            <a className="button button-secondary" href="#features">{dictionary['marketing.featuresLink']}</a>
          </div>
          <p className="hero-note">{dictionary['marketing.description']}</p>
        </div>
        <div className="preview" aria-label={dictionary['marketing.libraryTitle']}>
          <div className="preview-top"><span className="preview-dots" aria-hidden="true">● ● ●</span><span>Sonivo / {locale.toUpperCase()}</span></div>
          <div className="preview-title">{dictionary['marketing.eventsTitle']}</div>
          <div className="preview-row"><span className="preview-icon">♫</span><span>{dictionary['marketing.libraryTitle']}</span><span className="preview-status" /></div>
          <div className="preview-row"><span className="preview-icon">◷</span><span>{dictionary['marketing.eventsTitle']}</span><span className="preview-status preview-status-muted" /></div>
          <div className="preview-row"><span className="preview-icon">◎</span><span>{dictionary['marketing.teamTitle']}</span><span className="preview-status" /></div>
          <div className="preview-wave" aria-hidden="true">▂ ▅ ▃ ▇ ▄ ▆ ▂ ▅ ▇ ▃ ▆ ▂ ▄ ▇ ▅</div>
        </div>
      </section>

      <section className="features" aria-labelledby="features-title">
        <div id="features" className="section-heading">
          <p className="eyebrow">Sonivo</p>
          <h2 id="features-title">{dictionary['marketing.tagline']}</h2>
        </div>
        <div className="feature-grid">
          <article className="feature-card"><span className="feature-number">01</span><h3>{dictionary['marketing.libraryTitle']}</h3><p>{dictionary['marketing.libraryBody']}</p></article>
          <article className="feature-card"><span className="feature-number">02</span><h3>{dictionary['marketing.eventsTitle']}</h3><p>{dictionary['marketing.eventsBody']}</p></article>
          <article className="feature-card"><span className="feature-number">03</span><h3>{dictionary['marketing.teamTitle']}</h3><p>{dictionary['marketing.teamBody']}</p></article>
        </div>
      </section>

      <section className="closing">
        <h2>{dictionary['marketing.headline']}</h2>
        <p>{dictionary['marketing.intro']}</p>
        <Link className="button button-light" href={registerUrl}>{dictionary['marketing.primaryCta']} <span aria-hidden="true">↗</span></Link>
      </section>

      <footer className="site-footer"><Link className="brand" href={routes.marketingLocale(locale)}><span className="brand-mark" aria-hidden="true">S</span><span>Sonivo</span></Link><p>{dictionary['marketing.footer']}</p><Link href={loginUrl}>{dictionary['marketing.secondaryCta']}</Link></footer>
    </main>
  )
}
