import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { CurrentUser } from '../api/client'
import { BrandLockup } from '../brand/SonivoMark'
import { useT } from '../i18n'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'

const linkClass =
  'font-medium text-shell-foreground/70 no-underline hover:text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/**
 * Single application header (Phase AppHeader, W1). Sticky, 64px tall and
 * theme-aware through the `shell` tokens, so it follows light/dark like the
 * rest of the app. Guests get "Iniciar sesión"; the logged-in chrome keeps the
 * account / security / sign-out affordances until the user menu lands in W2.
 */
export function AppHeader({
  user,
  groupSlot,
  onLogout,
}: {
  user: CurrentUser | null
  /** Group switcher, shown inside a group workspace (W4). */
  groupSlot?: ReactNode
  onLogout?: () => void
}) {
  const { t } = useT()
  return (
    <header className="sticky top-0 z-40 border-b border-shell-border bg-shell/90 backdrop-blur">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-lg"
      >
        {t('a11y.skipToContent')}
      </a>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <BrandLockup to="/" shell />
          {groupSlot}
          <p className="hidden text-sm text-shell-foreground/60 lg:block">
            {t('chrome.tagline')}
          </p>
        </div>
        <nav
          aria-label={t('chrome.primaryNav')}
          className="flex min-w-0 shrink-0 items-center gap-3 text-sm"
        >
          {user ? (
            <>
              {/* The full address is the widest item: keep it from overflowing on phones. */}
              <span className="hidden max-w-[14rem] truncate text-shell-foreground/70 md:block">
                {user.email}
              </span>
              <Link to="/cuenta" className={cn(linkClass, 'hidden sm:inline')}>
                {t('chrome.account')}
              </Link>
              <Link
                to="/cuenta/seguridad"
                className={cn(linkClass, 'hidden sm:inline')}
              >
                {t('chrome.security')}
              </Link>
              {onLogout ? (
                <Button
                  variant="ghost"
                  className="text-shell-foreground/70 hover:text-shell-foreground"
                  onClick={onLogout}
                >
                  {t('chrome.logout')}
                </Button>
              ) : null}
            </>
          ) : (
            <Link to="/login" className={linkClass}>
              {t('chrome.login')}
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
