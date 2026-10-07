import { Languages, Palette } from 'lucide-react'
import { useTheme, type Theme } from '../brand/theme'
import { useLanguage, type I18nKey, type Language } from '../i18n'
import { Button } from '../ui/button'

const languageOptions: Array<{ value: Language; labelKey: I18nKey }> = [
  { value: 'es', labelKey: 'cuenta.spanish' },
  { value: 'en', labelKey: 'cuenta.english' },
  { value: 'pt', labelKey: 'cuenta.portuguese' },
]

const themeOptions: Array<{ value: Theme; labelKey: I18nKey }> = [
  { value: 'light', labelKey: 'cuenta.themeLight' },
  { value: 'dark', labelKey: 'cuenta.themeDark' },
]

/** `/cuenta/preferencias` — language + theme (ADR-0053; sidenav comes from AppShell). */
export function CuentaPreferencesPage() {
  const { lang, setLang, t } = useLanguage()
  const { theme, setTheme } = useTheme()
  return (
    <section className="max-w-xl space-y-8" aria-labelledby="cuenta-prefs-heading">
      <header className="space-y-1">
        <h1 id="cuenta-prefs-heading" className="text-2xl font-bold tracking-tight text-ink">
          {t('cuenta.preferences')}
        </h1>
      </header>
      <div className="space-y-3" aria-labelledby="prefs-language-heading">
        <div className="flex items-center gap-2">
          <Languages className="h-5 w-5 text-primary-ink" aria-hidden="true" />
          <h2 id="prefs-language-heading" className="text-lg font-semibold">
            {t('cuenta.language')}
          </h2>
        </div>
        <p className="text-sm text-muted">{t('cuenta.languageHint')}</p>
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
      </div>
      <div className="space-y-3" aria-labelledby="prefs-theme-heading">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary-ink" aria-hidden="true" />
          <h2 id="prefs-theme-heading" className="text-lg font-semibold">
            {t('cuenta.theme')}
          </h2>
        </div>
        <p className="text-sm text-muted">{t('cuenta.themeHint')}</p>
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
      </div>
    </section>
  )
}
