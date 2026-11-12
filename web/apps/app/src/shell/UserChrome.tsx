'use client'

import { Languages, Moon, Palette, Sun } from 'lucide-react'
import { fieldClass } from '../ui/field'
import { AccountCard } from './account/AccountCard'
import { AccountSettingsLayout } from './account/AccountSettingsLayout'
import { NotificationPreferences } from './account/NotificationPreferences'
import { useTheme, type Theme } from '../brand/theme'
import { useLanguage, type I18nKey, type Language } from '../i18n'

const languageOptions: Array<{ value: Language; labelKey: I18nKey }> = [
  { value: 'es', labelKey: 'account.spanish' },
  { value: 'en', labelKey: 'account.english' },
  { value: 'pt', labelKey: 'account.portuguese' },
]

const themeOptions: Array<{ value: Theme; labelKey: I18nKey; icon: typeof Sun }> = [
  { value: 'light', labelKey: 'account.themeLight', icon: Sun },
  { value: 'dark', labelKey: 'account.themeDark', icon: Moon },
]

/** routes.accountPreferences — language and appearance saved on this device. */
export function CuentaPreferencesPage() {
  const { lang, setLang, t } = useLanguage()
  const { theme, setTheme } = useTheme()
  return (
    <AccountSettingsLayout
      active="preferences"
      title={t('account.preferences')}
      description={t('account.preferencesSubtitle')}
    >
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <div className="space-y-4">
          <AccountCard title={t('account.language')}>
            <div className="flex items-start gap-3 px-2 pb-2">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-ink"><Languages className="h-5 w-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <label htmlFor="account-language" className="block text-sm font-semibold text-ink">{t('account.language')}</label>
                <p id="account-language-hint" className="mt-1 text-sm text-muted">{t('account.languageHint')}</p>
                <select id="account-language" aria-describedby="account-language-hint" className={`${fieldClass} mt-3`} value={lang} onChange={(event) => setLang(event.target.value as Language)}>
                  {languageOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
                </select>
              </div>
            </div>
          </AccountCard>

          <NotificationPreferences />
          <AccountCard title={t('account.theme')}>
            <div className="flex items-start gap-3 px-2 pb-2">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-ink"><Palette className="h-5 w-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t('account.theme')}</p>
                <p className="mt-1 text-sm text-muted">{t('account.themeHint')}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-border-subtle bg-canvas p-1" role="group" aria-label={t('account.theme')}>
                  {themeOptions.map(({ value, labelKey, icon: Icon }) => (
                    <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none ${theme === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted hover:bg-surface-hover hover:text-ink'}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />{t(labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </AccountCard>
        </div>

        <AccountCard title={t('account.preferencesPreview')}>
          <p className="px-2 pb-3 text-sm text-muted">{t('account.preferencesPreviewHint')}</p>
          <div className="overflow-hidden rounded-2xl border border-border-subtle bg-canvas text-ink">
            <div className="flex items-center gap-3 border-b border-border-subtle bg-surface px-4 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary-ink"><Palette className="h-4 w-4" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{t('account.preferencesPreviewTitle')}</p>
                <p className="text-xs text-muted">{t(lang === 'es' ? 'account.spanish' : lang === 'pt' ? 'account.portuguese' : 'account.english')} · {t(theme === 'dark' ? 'account.themeDark' : 'account.themeLight')}</p>
              </div>
            </div>
            <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 p-3" aria-hidden="true">
              <div className="space-y-2 rounded-xl border border-border-subtle bg-surface p-2">
                <span className="block h-2 w-full rounded-full bg-primary/50" />
                <span className="block h-2 w-4/5 rounded-full bg-surface-hover" />
                <span className="block h-2 w-full rounded-full bg-surface-hover" />
              </div>
              <div className="space-y-3 rounded-xl border border-border-subtle bg-surface p-3">
                <span className="block h-2 w-2/3 rounded-full bg-surface-hover" />
                <div className="flex h-12 items-center gap-1 rounded-lg bg-primary/10 px-3">
                  {Array.from({ length: 18 }, (_, index) => <span key={index} className="w-1 rounded-full bg-primary" style={{ height: `${8 + ((index * 11) % 24)}px` }} />)}
                </div>
                <span className="block h-8 w-full rounded-lg bg-primary" />
              </div>
            </div>
          </div>
        </AccountCard>
      </div>
    </AccountSettingsLayout>
  )
}
