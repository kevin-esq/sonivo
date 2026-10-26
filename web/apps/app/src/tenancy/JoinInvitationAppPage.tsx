'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAppRuntime } from '../appRuntime/context'
import { routes } from '../routing/routes'
import { MustChangePassword } from '../shell/MustChangePassword'
import { SessionScreen } from '../shell/GroupsChrome'
import { useT } from '../i18n'
import { JoinInvitationContent, safeJoinNextPath } from './JoinPage'
import { Button } from '../ui/button'

export function JoinInvitationAppPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const { session, onRetry } = useAppRuntime()
  const { t } = useT()

  useEffect(() => {
    if (session.status !== 'guest') return
    const next = routes.joinInvitation(token ?? '')
    const safeNext = safeJoinNextPath(next)
    router.replace(`${routes.login}${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`)
  }, [router, session.status, token])

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
  if (session.status === 'loading' || session.status === 'guest') return <SessionScreen message={t('joinGroup.checking')} />
  if (session.user.mustChangePassword) return <MustChangePassword onDone={onRetry} />

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8 text-ink sm:px-6">
      <section className="rounded-2xl bg-surface p-6 shadow-sm">
        <JoinInvitationContent token={token} navigate={(to) => router.push(to)} navigationMode="next" />
      </section>
    </main>
  )
}
