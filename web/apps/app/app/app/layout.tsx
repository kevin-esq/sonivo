'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AppShell } from '@/src/shell/AppShell'
import { AuthenticatedPlayer } from '@/src/shell/AuthenticatedPlayer'
import { useAppRuntime } from '@/src/appRuntime/context'
import { MustChangePassword } from '@/src/shell/MustChangePassword'
import { SessionScreen } from '@/src/shell/GroupsChrome'
import { ErrorBoundary } from '@/src/ui/ErrorBoundary'
import { Button } from '@/src/ui/button'
import { routes } from '@/src/routing/routes'
import { useT } from '@/src/i18n'

export default function ProductLayout({ children }: { children: ReactNode }) {
  const { session, onLogout, onRetry } = useAppRuntime()
  const pathname = usePathname() ?? routes.app
  const router = useRouter()
  const { t } = useT()
  const usesLegacyRouteBridge =
    pathname.startsWith('/app/groups/') ||
    pathname.startsWith('/app/join/') ||
    pathname.startsWith('/app/g/')

  useEffect(() => {
    if (usesLegacyRouteBridge || session.status !== 'guest') return
    const next = `${window.location.pathname}${window.location.search}`
    router.replace(`${routes.login}?next=${encodeURIComponent(next)}`)
  }, [router, session.status, usesLegacyRouteBridge])

  if (session.status === 'loading' || session.status === 'guest') {
    if (usesLegacyRouteBridge) return <>{children}</>
    return <SessionScreen message={t('state.checkingSession')} />
  }

  if (session.status === 'error') {
    if (usesLegacyRouteBridge) return <>{children}</>
    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-6 py-10 text-ink">
        <div role="alert" className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-bold">{t('state.offlineTitle')}</h1>
          <p className="text-sm text-muted">{t('state.offlineBody')}</p>
          <Button onClick={onRetry}>{t('state.retry')}</Button>
        </div>
      </div>
    )
  }

  if (!usesLegacyRouteBridge && session.user.mustChangePassword) return <MustChangePassword onDone={onRetry} />

  if (usesLegacyRouteBridge) return <>{children}</>

  return (
    <>
      <AppShell user={session.user} onLogout={onLogout} navigationMode="next">
        <ErrorBoundary resetKey={pathname} navigationMode="next">{children}</ErrorBoundary>
      </AppShell>
      <AuthenticatedPlayer active />
    </>
  )
}
