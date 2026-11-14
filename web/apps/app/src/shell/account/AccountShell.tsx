import type { ReactNode } from 'react'
import type { CurrentUser } from '../../api/client'
import { useT } from '../../i18n'
import { AppLink, AppNavigationProvider, type NavigationMode } from '../../routing/AppLink'
import { routes } from '../../routing/routes'
import { Button } from '../../ui/button'
import { BrandLockup } from '../../brand/SonivoMark'

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : (parts[0] ?? '?').slice(0, 2)).toUpperCase()
}

export function AccountShell({
  user,
  onLogout,
  children,
  navigationMode = 'next',
}: {
  user: CurrentUser
  onLogout: () => void
  children: ReactNode
  navigationMode?: NavigationMode
}) {
  const { t } = useT()

  return (
    <AppNavigationProvider mode={navigationMode}>
      <div className="min-h-screen bg-canvas text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-lg"
        >
          {t('a11y.skipToContent')}
        </a>
        <header className="border-b border-border-subtle bg-shell">
          <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-4 sm:gap-8">
              <BrandLockup to={routes.home} />
              <span aria-hidden="true" className="hidden h-7 w-px bg-shell-border sm:block" />
              <span className="truncate text-sm font-semibold text-shell-foreground sm:text-base">
                {t('account.title')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden max-w-52 truncate text-sm text-shell-foreground/75 sm:block">
                {user.displayName?.trim() || user.email}
              </span>
              <AppLink
                to={routes.home}
                className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-shell-foreground no-underline hover:bg-shell-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                {t('account.backToSonivo')}
              </AppLink>
              <details className="group relative">
                <summary aria-label={t('account.userMenu')} data-testid="account-user-menu-toggle" className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full bg-primary-strong text-sm font-semibold text-primary-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  {initialsOf(user.displayName?.trim() || user.email || '')}
                </summary>
                <div className="absolute right-0 top-full z-20 mt-2 min-w-48 rounded-xl border border-border-subtle bg-surface p-2 text-ink shadow-xl">
                  <p className="truncate px-3 py-2 text-xs text-muted">{user.email}</p>
                  <Button variant="secondary" className="w-full justify-start" onClick={onLogout}>{t('chrome.logout')}</Button>
                </div>
              </details>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
          {children}
        </main>
      </div>
    </AppNavigationProvider>
  )
}
