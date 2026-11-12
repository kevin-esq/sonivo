import {
  Bell,
  CreditCard,
  LayoutDashboard,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { AppLink } from '../../routing/AppLink'
import { routes } from '../../routing/routes'
import { useT, type I18nKey } from '../../i18n'

type AccountSettingsSection = 'overview' | 'profile' | 'security' | 'preferences' | 'notifications' | 'membership'

const sections: Array<{ id: AccountSettingsSection; to: string; label: I18nKey; icon: LucideIcon }> = [
  { id: 'overview', to: routes.account, label: 'account.title', icon: LayoutDashboard },
  { id: 'profile', to: routes.accountProfile, label: 'account.profile', icon: UserRound },
  { id: 'security', to: routes.accountSecurity, label: 'account.security', icon: ShieldCheck },
  { id: 'preferences', to: routes.accountPreferences, label: 'account.preferences', icon: SlidersHorizontal },
  { id: 'notifications', to: routes.accountNotifications, label: 'notifications.accountTitle', icon: Bell },
  { id: 'membership', to: routes.accountMembership, label: 'account.membership', icon: CreditCard },
]

export function AccountSettingsLayout({
  active,
  title,
  description,
  children,
}: {
  active: AccountSettingsSection
  title: string
  description: string
  children: ReactNode
}) {
  const { t } = useT()
  const activeSection = sections.find((section) => section.id === active) ?? sections[0]
  const ActiveIcon = activeSection.icon

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary-ink sm:h-14 sm:w-14">
          <ActiveIcon className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <h1 className="sonivo-page-title text-ink">{title}</h1>
          <p className="max-w-3xl text-sm text-muted sm:text-base">{description}</p>
        </div>
      </header>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        <nav tabIndex={0} aria-label={t('account.settingsNavLabel')} className="-mx-1 overflow-x-auto px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden">
          <div className="flex min-w-max gap-1 rounded-xl border border-border-subtle bg-surface p-1 shadow-sm">
            {sections.map(({ id, to, label, icon: Icon }) => {
              const selected = id === active
              return (
                <AppLink
                  key={id}
                  to={to}
                  aria-current={selected ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none ${selected
                    ? 'bg-primary-strong text-primary-foreground shadow-sm'
                    : 'text-muted hover:bg-surface-hover hover:text-ink'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{t(label)}</span>
                </AppLink>
              )
            })}
          </div>
        </nav>

        <nav aria-label={t('account.settingsNavLabel')} className="hidden lg:block">
          <ul className="sticky top-6 space-y-1 rounded-2xl border border-border-subtle bg-surface p-2 shadow-sm">
            {sections.map(({ id, to, label, icon: Icon }) => {
              const selected = id === active
              return (
                <li key={id}>
                  <AppLink
                    to={to}
                    aria-current={selected ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none ${selected
                      ? 'bg-primary-strong text-primary-foreground shadow-sm'
                      : 'text-muted hover:bg-surface-hover hover:text-ink'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{t(label)}</span>
                  </AppLink>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    </div>
  )
}
