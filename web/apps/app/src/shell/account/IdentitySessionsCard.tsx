import { useCallback, useEffect, useState } from 'react'
import { MonitorSmartphone, ShieldCheck, X } from 'lucide-react'
import { listIdentitySessions, revokeIdentitySession, type IdentitySession } from '../../api/auth'
import { problemDetail } from '../../api/http'
import { useT } from '../../i18n'
import { Button } from '../../ui/button'
import { AccountCard } from './AccountCard'
import { routes } from '../../routing/routes'

export function IdentitySessionsCard() {
  const { t, lang } = useT()
  const [sessions, setSessions] = useState<IdentitySession[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      setSessions(await listIdentitySessions())
    } catch (cause) {
      setError(problemDetail(cause, t))
      setSessions([])
    }
  }, [t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const revoke = async (session: IdentitySession) => {
    setRevoking(session.sessionKey)
    setError(null)
    try {
      await revokeIdentitySession(session.sessionKey)
      if (session.isCurrent) {
        window.location.replace(routes.login)
        return
      }
      await refresh()
    } catch (cause) {
      setError(problemDetail(cause, t))
    } finally {
      setRevoking(null)
    }
  }

  const formatDate = (value: string) => new Intl.DateTimeFormat(lang, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

  return (
    <AccountCard title={t('profile.sessions')}>
      <p className="px-2 py-1 text-sm text-muted">{t('profile.sessionsHint')}</p>
      {sessions === null ? (
        <p className="px-2 py-2 text-sm text-muted" role="status">{t('profile.sessionsLoading')}</p>
      ) : sessions.length === 0 ? (
        <p className="px-2 py-2 text-sm text-muted" role={error ? 'alert' : 'status'}>
          {error ?? t('profile.sessionsEmpty')}
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {sessions.map((session) => (
            <li key={session.sessionKey} className="flex items-center justify-between gap-3 px-2 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <MonitorSmartphone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                    {session.isCurrent ? t('profile.sessionCurrent') : t('profile.sessionOther')}
                    {session.isCurrent ? <ShieldCheck aria-hidden="true" className="size-4 text-success" /> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {t('profile.sessionLastSeen', { date: formatDate(session.lastSeenAt) })}
                  </p>
                </div>
              </div>
              <Button
                variant={session.isCurrent ? 'danger' : 'secondary'}
                size="sm"
                disabled={revoking !== null}
                aria-label={session.isCurrent ? t('profile.sessionRevokeCurrent') : t('profile.sessionRevokeOther')}
                onClick={() => void revoke(session)}
              >
                <X aria-hidden="true" className="size-4" />
                {revoking === session.sessionKey ? t('profile.sessionRevoking') : t('profile.sessionRevoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && sessions && sessions.length > 0 ? <p role="alert" className="px-2 py-2 text-sm text-error">{error}</p> : null}
    </AccountCard>
  )
}
