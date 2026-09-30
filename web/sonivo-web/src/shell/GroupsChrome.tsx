import { Link } from 'react-router-dom'
import { BrandLockup } from '../brand/SonivoMark'
import type { CurrentUser } from '../api/client'
import { useT } from '../i18n'
import { Button } from '../ui/button'

export function GroupsChrome({
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
        <div className="flex items-center gap-4">
          <BrandLockup to="/" shell />
          <p className="hidden text-sm text-shell-foreground/70 sm:block">{t('chrome.tagline')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-shell-foreground">{user.email}</span>
          <Link to="/cuenta" className="font-semibold text-shell-link no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
            {t('chrome.account')}
          </Link>
          <Link to="/cuenta/seguridad" className="font-semibold text-shell-link no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
            {t('chrome.security')}
          </Link>
          <Button variant="ghost" className="text-shell-link hover:text-shell-foreground" onClick={onLogout}>
            {t('chrome.logout')}
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-8">
        <div className="rounded-2xl border border-slate-200 bg-surface p-5 text-ink shadow-sm sm:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}

export function PublicChrome({
  children,
  user,
}: {
  children: React.ReactNode
  user?: CurrentUser | null
}) {
  const { t } = useT()
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between px-6 py-4">
        <BrandLockup to={user ? '/' : '/login'} shell />
        {user ? null : (
          <Link
            to="/login"
            className="text-sm font-semibold text-shell-link no-underline hover:underline"
          >
            {t('chrome.login')}
          </Link>
        )}
      </header>
      <main className="mx-auto w-full max-w-lg px-6 py-8">
        <div className="rounded-2xl bg-white p-6 text-neutral-dark shadow-sm">{children}</div>
      </main>
    </div>
  )
}

export function SessionScreen({ message }: { message: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas text-shell-foreground">
      <p aria-live="polite">{message}</p>
    </div>
  )
}
