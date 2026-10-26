'use client'

import { Suspense, useEffect, type ReactNode } from 'react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAppRuntime } from '@/src/appRuntime/context'
import { GroupWorkspace } from '@/src/shell/GroupWorkspace'
import { AuthenticatedPlayer } from '@/src/shell/AuthenticatedPlayer'
import { SessionScreen } from '@/src/shell/GroupsChrome'
import { MustChangePassword } from '@/src/shell/MustChangePassword'
import { ErrorBoundary } from '@/src/ui/ErrorBoundary'
import { Button } from '@/src/ui/button'
import { useT } from '@/src/i18n'
import { routes } from '@/src/routing/routes'

function GroupAppLayoutContent({ children }: { children: ReactNode }) {
  const { session, onLogout, onRetry } = useAppRuntime()
  const { groupId } = useParams<{ groupId: string }>()
  const pathname = usePathname() ?? routes.groups
  const searchParams = useSearchParams()
  const search = searchParams.toString() ? `?${searchParams.toString()}` : ''
  const router = useRouter()
  const { t } = useT()

  useEffect(() => {
    if (session.status !== 'guest') return
    const next = `${window.location.pathname}${window.location.search}`
    router.replace(`${routes.login}?next=${encodeURIComponent(next)}`)
  }, [router, session.status])

  if (session.status === 'loading' || session.status === 'guest') {
    return <SessionScreen message={t('state.checkingSession')} />
  }

  if (session.status === 'error') {
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

  if (session.user.mustChangePassword) return <MustChangePassword onDone={onRetry} />

  return (
    <>
      <GroupWorkspace
        user={session.user}
        onLogout={onLogout}
        groupId={groupId}
        pathname={pathname}
        search={search}
        navigate={(to, options) => options?.replace ? router.replace(to) : router.push(to)}
        navigationMode="next"
      >
        <ErrorBoundary resetKey={pathname} navigationMode="next">{children}</ErrorBoundary>
      </GroupWorkspace>
      <AuthenticatedPlayer active />
    </>
  )
}

export function GroupAppLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}><GroupAppLayoutContent>{children}</GroupAppLayoutContent></Suspense>
}
