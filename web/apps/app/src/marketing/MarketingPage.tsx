import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Moon,
  Music2,
  Sparkles,
  Sun,
} from 'lucide-react'
import { BrandLockup } from '../brand/SonivoMark'
import { useT } from '../i18n'
import { useTheme } from '../brand/theme'
import type { CurrentUser } from '../api/client'
import { MarketingShowcase } from './MarketingShowcase'
import { routes } from '../routing/routes'

const STEPS = [
  { title: 'marketing.step1Title', body: 'marketing.step1Body' },
  { title: 'marketing.step2Title', body: 'marketing.step2Body' },
  { title: 'marketing.step3Title', body: 'marketing.step3Body' },
] as const

/**
 * Public marketing landing (`/`). Reachable without a session so it can be
 * shared/SEO-crawled; every CTA routes into the real product. Copy is fully
 * localized through `t()` (es default, en, pt).
 *
 * When a session already exists the header swaps the sign-in/register pair for
 * a single "go to app" entry, so a signed-in visitor reaches routes.home instead of
 * being offered to sign in again.
 */
export function MarketingPage({ user }: { user?: CurrentUser | null }) {
  const { t } = useT()
  const { theme, setTheme } = useTheme()

  return (
    <div className="marketing-page min-h-screen bg-canvas text-ink">
      <header className="marketing-header sticky top-0 z-30 border-b border-border-subtle bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <BrandLockup to={routes.marketing} />
            <nav className="hidden items-center gap-6 text-sm font-medium text-muted md:flex" aria-label={t('marketing.navLabel')}>
            <a href="#features" className="hover:text-ink">{t('marketing.navFeatures')}</a>
            <a href="#how" className="hover:text-ink">{t('marketing.navHow')}</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="grid h-11 w-11 place-items-center rounded-full border border-border-subtle bg-surface/70 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label={t('marketing.themeToggle')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
            </button>
            {user ? (
              <Link
                to={routes.home}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-strong px-4 py-2 text-sm font-semibold text-primary-foreground no-underline shadow-sm hover:bg-primary-strong/90"
              >
                {t('marketing.goToApp')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <>
                <Link
                  to={routes.login}
                  className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-ink no-underline hover:bg-surface-hover sm:inline-flex"
                >
                  {t('marketing.login')}
                </Link>
                <Link
                  to={routes.register}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-strong px-4 py-2 text-sm font-semibold text-primary-foreground no-underline shadow-sm hover:bg-primary-strong/90"
                >
                  {t('marketing.register')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="marketing-hero relative overflow-hidden">
          <div className="marketing-hero__ambient" aria-hidden="true">
            <div className="marketing-hero__image marketing-hero__image--dark" />
            <div className="marketing-hero__image marketing-hero__image--light" />
            <div className="marketing-hero__wash marketing-hero__wash--dark" />
            <div className="marketing-hero__wash marketing-hero__wash--light" />
          </div>
          <div className="marketing-hero__inner mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-14 lg:py-28">
            <div className="marketing-hero__copy space-y-6">
              <span className="marketing-hero__badge inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/90">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {t('marketing.heroBadge')}
              </span>
              <h1 className="max-w-[13ch] font-display text-4xl font-bold leading-[1.04] tracking-[-0.035em] sm:text-5xl lg:text-[3.65rem]">
                {t('marketing.heroTitle')}
              </h1>
              <p className="marketing-hero__subtitle max-w-xl text-lg leading-8 text-white/75">{t('marketing.heroSubtitle')}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to={user ? routes.home : routes.register}
                  className="marketing-hero__cta-primary inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#1b1035] no-underline shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transform-none"
                >
                  {user ? t('marketing.goToApp') : t('marketing.heroCta')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                {user ? null : (
                  <Link
                    to={routes.login}
                    className="marketing-hero__cta-secondary inline-flex min-h-12 items-center gap-2 rounded-full border border-white/25 px-5 py-3 text-sm font-semibold text-white no-underline transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                  >
                    {t('marketing.heroCtaSecondary')}
                  </Link>
                )}
              </div>
              <p className="text-sm text-white/70">{t('marketing.heroNote')}</p>
            </div>

            {/* Product mock */}
            <div className="marketing-preview" role="group" aria-label={t('marketing.mockWeek')}>
              <div className="marketing-preview__toolbar">
                <span className="marketing-preview__window-dot" />
                <span className="marketing-preview__window-dot" />
                <span className="marketing-preview__window-dot" />
                <span className="ml-auto text-xs font-medium text-white/60">{t('marketing.mockWeek')}</span>
              </div>
              <div className="marketing-preview__body">
                <div className="marketing-preview__week" aria-hidden="true">
                  {t('marketing.weekdays').split(' ').map((day, index) => (
                    <span
                      key={`${day}-${index}`}
                      className={index === 2 ? 'marketing-preview__day is-active' : 'marketing-preview__day'}
                    >
                      {day}
                    </span>
                  ))}
                </div>
                <div className="marketing-preview__events">
                  {[t('marketing.mockItem1'), t('marketing.mockItem2'), t('marketing.mockItem3')].map((item, index) => (
                    <div key={item} className="marketing-preview__event">
                      <span className={index === 0 ? 'marketing-preview__event-icon is-active' : 'marketing-preview__event-icon'}>
                        <Music2 className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-white/85">{item}</span>
                      <span className={index === 0 ? 'marketing-preview__event-state is-ready' : 'marketing-preview__event-state'} aria-hidden="true" />
                    </div>
                  ))}
                </div>
                <div className="marketing-preview__footer">
                  <span className="marketing-preview__wave" aria-hidden="true">
                    {[8, 15, 10, 22, 13, 28, 17, 11, 21, 13, 25, 9, 17, 11, 20, 8, 14].map((height, index) => (
                      <i key={index} style={{ height }} />
                    ))}
                  </span>
                  <span className="text-xs text-white/60">Sonivo</span>
                  <span className="ml-auto text-xs text-white/45">{t('marketing.heroNote')}</span>
                </div>
              </div>
              <div className="marketing-preview__glow" aria-hidden="true" />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="marketing-features mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-32">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{t('marketing.featuresTitle')}</h2>
            <p className="mt-4 max-w-xl text-lg leading-8 text-muted">{t('marketing.featuresSubtitle')}</p>
          </div>
          <MarketingShowcase />
        </section>

        {/* How it works */}
        <section id="how" className="marketing-how border-y border-border-subtle bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{t('marketing.howTitle')}</h2>
            <div className="marketing-steps mt-10 grid gap-8 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <div key={step.title} className="marketing-step space-y-3">
                  <span className="marketing-step__number grid h-10 w-10 place-items-center rounded-full bg-primary-strong font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="font-semibold text-ink">{t(step.title)}</h3>
                  <p className="text-sm text-muted">{t(step.body)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div className="marketing-final rounded-3xl px-6 py-12 text-center text-white sm:px-12 sm:py-16">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{t('marketing.finalTitle')}</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/80">{t('marketing.finalBody')}</p>
            <Link
              to={user ? routes.home : routes.register}
              className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#1b1035] no-underline transition-transform hover:-translate-y-0.5 hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transform-none"
            >
              {user ? t('marketing.goToApp') : t('marketing.finalCta')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
          <span>{t('marketing.footerRights')}</span>
          {user ? (
            <Link to={routes.home} className="no-underline hover:text-ink">{t('marketing.goToApp')}</Link>
          ) : (
            <div className="flex items-center gap-4">
              <Link to={routes.login} className="no-underline hover:text-ink">{t('marketing.login')}</Link>
              <Link to={routes.register} className="no-underline hover:text-ink">{t('marketing.register')}</Link>
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}
