import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  CheckSquare,
  ListMusic,
  Music2,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { BrandLockup } from '../brand/SonivoMark'
import { useT } from '../i18n'
import { useTheme } from '../brand/theme'
import { cn } from '../ui/cn'

const FEATURES = [
  { icon: Music2, title: 'marketing.featureLibraryTitle', body: 'marketing.featureLibraryBody' },
  { icon: ListMusic, title: 'marketing.featureSetlistTitle', body: 'marketing.featureSetlistBody' },
  { icon: CalendarDays, title: 'marketing.featureEventsTitle', body: 'marketing.featureEventsBody' },
  { icon: CheckSquare, title: 'marketing.featureTasksTitle', body: 'marketing.featureTasksBody' },
  { icon: Users, title: 'marketing.featureRolesTitle', body: 'marketing.featureRolesBody' },
  { icon: ShieldCheck, title: 'marketing.featureSecurityTitle', body: 'marketing.featureSecurityBody' },
] as const

const STEPS = [
  { title: 'marketing.step1Title', body: 'marketing.step1Body' },
  { title: 'marketing.step2Title', body: 'marketing.step2Body' },
  { title: 'marketing.step3Title', body: 'marketing.step3Body' },
] as const

const PLANS = [
  { name: 'marketing.planFreeName', price: 'marketing.planFreePrice', body: 'marketing.planFreeBody', featured: false },
  { name: 'marketing.planProName', price: 'marketing.planProPrice', body: 'marketing.planProBody', featured: true },
  { name: 'marketing.planBandName', price: 'marketing.planBandPrice', body: 'marketing.planBandBody', featured: false },
] as const

/**
 * Public marketing landing (`/bienvenido`). Reachable without a session so it can
 * be shared/SEO-crawled; every CTA routes into the real product. Copy is fully
 * localized through `t()` (es default, en, pt).
 */
export function MarketingPage() {
  const { t } = useT()
  const { theme, setTheme } = useTheme()

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <BrandLockup to="/bienvenido" />
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted md:flex" aria-label={t('marketing.navLabel')}>
            <a href="#features" className="hover:text-ink">{t('marketing.navFeatures')}</a>
            <a href="#how" className="hover:text-ink">{t('marketing.navHow')}</a>
            <a href="#plans" className="hover:text-ink">{t('marketing.navPlans')}</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="grid h-10 w-10 place-items-center rounded-xl border border-border-subtle text-muted hover:text-ink"
              aria-label={t('marketing.themeToggle')}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </button>
            <Link
              to="/login"
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-ink no-underline hover:bg-surface-hover sm:inline-flex"
            >
              {t('marketing.login')}
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-primary-strong px-4 py-2 text-sm font-semibold text-primary-foreground no-underline shadow-sm hover:bg-primary-strong/90"
            >
              {t('marketing.register')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 -z-10"
            aria-hidden="true"
            style={{ backgroundImage: 'linear-gradient(140deg, var(--color-primary) 0%, #1b1035 70%)' }}
          />
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 text-white sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {t('marketing.heroBadge')}
              </span>
              <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                {t('marketing.heroTitle')}
              </h1>
              <p className="max-w-xl text-lg text-white/80">{t('marketing.heroSubtitle')}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#1b1035] no-underline shadow-sm hover:bg-white/90"
                >
                  {t('marketing.heroCta')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-5 py-3 text-sm font-semibold text-white no-underline hover:bg-white/10"
                >
                  {t('marketing.heroCtaSecondary')}
                </Link>
              </div>
              <p className="text-sm text-white/60">{t('marketing.heroNote')}</p>
            </div>

            {/* Product mock */}
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3 shadow-2xl backdrop-blur">
              <div className="rounded-xl bg-[#140b2a]/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">{t('marketing.mockWeek')}</p>
                <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs">
                  {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => (
                    <div
                      key={index}
                      className={cn(
                        'rounded-lg py-2',
                        index === 2 ? 'bg-primary text-white' : 'bg-white/5 text-white/70',
                      )}
                    >
                      {day}
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {[t('marketing.mockItem1'), t('marketing.mockItem2'), t('marketing.mockItem3')].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                      <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/40">
                        <Music2 className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="truncate text-sm text-white/85">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{t('marketing.featuresTitle')}</h2>
            <p className="mt-3 text-muted">{t('marketing.featuresSubtitle')}</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="rounded-2xl border border-border-subtle bg-surface p-5">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary-ink">
                  <feature.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-semibold text-ink">{t(feature.title)}</h3>
                <p className="mt-1 text-sm text-muted">{t(feature.body)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y border-border-subtle bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{t('marketing.howTitle')}</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <div key={step.title} className="space-y-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-strong font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="font-semibold text-ink">{t(step.title)}</h3>
                  <p className="text-sm text-muted">{t(step.body)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Plans */}
        <section id="plans" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{t('marketing.plansTitle')}</h2>
            <p className="mt-3 text-muted">{t('marketing.plansSubtitle')}</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PLANS.map((plan) => (
              <article
                key={plan.name}
                className={cn(
                  'flex flex-col rounded-2xl border p-6',
                  plan.featured ? 'border-primary bg-primary/5 shadow-sm' : 'border-border-subtle bg-surface',
                )}
              >
                <h3 className="font-semibold text-ink">{t(plan.name)}</h3>
                <p className="mt-2 font-display text-3xl font-bold text-ink">{t(plan.price)}</p>
                <p className="mt-3 flex-1 text-sm text-muted">{t(plan.body)}</p>
                <Link
                  to="/register"
                  className={cn(
                    'mt-5 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold no-underline',
                    plan.featured
                      ? 'bg-primary-strong text-primary-foreground hover:bg-primary-strong/90'
                      : 'border border-border-subtle text-ink hover:bg-surface-hover',
                  )}
                >
                  {t('marketing.planCta')}
                </Link>
              </article>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted">{t('marketing.plansNote')}</p>
        </section>

        {/* Final CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div
            className="rounded-3xl px-6 py-12 text-center text-white"
            style={{ backgroundImage: 'linear-gradient(120deg, var(--color-primary) 0%, #1b1035 100%)' }}
          >
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{t('marketing.finalTitle')}</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/80">{t('marketing.finalBody')}</p>
            <Link
              to="/register"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[#1b1035] no-underline hover:bg-white/90"
            >
              {t('marketing.finalCta')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
          <span>{t('marketing.footerRights')}</span>
          <div className="flex items-center gap-4">
            <Link to="/login" className="no-underline hover:text-ink">{t('marketing.login')}</Link>
            <Link to="/register" className="no-underline hover:text-ink">{t('marketing.register')}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
