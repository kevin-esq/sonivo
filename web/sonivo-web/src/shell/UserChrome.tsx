import { NavLink } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { Languages, Palette, ShieldCheck, UserRound, Users } from 'lucide-react'
import { BrandLockup } from '../brand/SonivoMark'
import { useTheme, type Theme } from '../brand/theme'
import { useLanguage, useT, type I18nKey, type Language } from '../i18n'
import type { CurrentUser } from '../api/client'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'

type CuentaTab = {
  id: string
  labelKey: I18nKey
  icon: LucideIcon
  to: string
  end?: boolean
}

const cuentaTabs: CuentaTab[] = [
  { id: 'profile', labelKey: 'cuenta.profile', icon: UserRound, to: '/cuenta', end: true },
  { id: 'preferences', labelKey: 'cuenta.preferences', icon: Palette, to: '/cuenta/preferencias' },
  { id: 'security', labelKey: 'cuenta.security', icon: ShieldCheck, to: '/cuenta/seguridad' },
  { id: 'groups', labelKey: 'cuenta.groups', icon: Users, to: '/cuenta/grupos' },
]

export function UserChrome({
  user,
  onLogout,
  children,
}: {
  user: CurrentUser
  onLogout: () => void
  children: React.ReactNode
}) {
  const { t } = useT()
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-shell-border px-6 py-4">
        <BrandLockup to="/" shell />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-shell-foreground/70">{user.email}</span>
          <Button variant="ghost" className="text-shell-link hover:text-shell-foreground" onClick={onLogout}>
            {t('chrome.logout')}
          </Button>
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-8">
        <h1 className="text-2xl font-bold tracking-tight text-shell-foreground">{t('cuenta.title')}</h1>
        <nav
          className="mt-4 flex gap-2 overflow-x-auto border-b border-shell-border"
          aria-label={t('cuenta.nav')}
        >
          {cuentaTabs.map((tab) => {
            const Icon = tab.icon
            return (
              <NavLink
                key={tab.id}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium no-underline transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary motion-reduce:transition-none',
                    isActive
                      ? 'border-secondary text-shell-foreground'
                      : 'border-transparent text-shell-foreground/70 hover:text-shell-foreground',
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t(tab.labelKey)}
              </NavLink>
            )
          })}
        </nav>
        <main className="mt-4 rounded-2xl bg-white p-6 text-neutral-dark shadow-sm">{children}</main>
      </div>
    </div>
  )
}

const languageOptions: Array<{ value: Language; labelKey: I18nKey }> = [
  { value: 'es', labelKey: 'cuenta.spanish' },
  { value: 'en', labelKey: 'cuenta.english' },
]

const themeOptions: Array<{ value: Theme; labelKey: I18nKey }> = [
  { value: 'light', labelKey: 'cuenta.themeLight' },
  { value: 'dark', labelKey: 'cuenta.themeDark' },
]

export function CuentaPreferencesPage() {
  const { lang, setLang, t } = useLanguage()
  const { theme, setTheme } = useTheme()
  return (
    <div className="max-w-xl space-y-8">
      <section className="space-y-3" aria-labelledby="prefs-language-heading">
        <div className="flex items-center gap-2">
          <Languages className="h-5 w-5 text-shell-link" aria-hidden="true" />
          <h2 id="prefs-language-heading" className="text-lg font-semibold">
            {t('cuenta.language')}
          </h2>
        </div>
        <p className="text-sm text-slate-500">{t('cuenta.languageHint')}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('cuenta.language')}>
          {languageOptions.map((option) => (
            <Button
              key={option.value}
              variant={lang === option.value ? 'primary' : 'secondary'}
              aria-pressed={lang === option.value}
              onClick={() => setLang(option.value)}
            >
              {t(option.labelKey)}
            </Button>
          ))}
        </div>
      </section>
      <section className="space-y-3" aria-labelledby="prefs-theme-heading">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-shell-link" aria-hidden="true" />
          <h2 id="prefs-theme-heading" className="text-lg font-semibold">
            {t('cuenta.theme')}
          </h2>
        </div>
        <p className="text-sm text-slate-500">{t('cuenta.themeHint')}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('cuenta.theme')}>
          {themeOptions.map((option) => (
            <Button
              key={option.value}
              variant={theme === option.value ? 'primary' : 'secondary'}
              aria-pressed={theme === option.value}
              onClick={() => setTheme(option.value)}
            >
              {t(option.labelKey)}
            </Button>
          ))}
        </div>
      </section>
    </div>
  )
}
