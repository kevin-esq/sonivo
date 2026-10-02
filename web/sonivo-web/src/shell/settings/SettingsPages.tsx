import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listMyGroups, problemDetail, type GroupSummary } from '../../api/client'
import { useT } from '../../i18n'

export function SettingsProfilePage({
  user,
}: {
  user: { email?: string | null; displayName?: string | null; id?: string; managedByGroupId?: string | null }
}) {
  const sessionName = user?.displayName ?? ''
  const email = user?.email ?? ''
  const { t } = useT()

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t('perfil.title')}</h1>
        <p className="text-sm text-muted">{t('perfil.subtitle')}</p>
      </div>

      {user?.managedByGroupId ? (
        <p
          role="status"
          data-testid="managed-account-notice"
          className="rounded-xl bg-surface-hover px-3 py-2 text-sm text-ink"
        >
          {t('perfil.managedNotice')}
        </p>
      ) : null}

      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('perfil.fullName')}</span>
          <input
            key={sessionName}
            type="text"
            defaultValue={sessionName}
            className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('perfil.email')}</span>
          <input
            type="email"
            disabled
            readOnly
            className="w-full cursor-not-allowed rounded-xl border border-border-subtle bg-surface-hover px-3 py-2 text-muted"
            value={email}
          />
        </label>
      </div>
    </div>
  )
}

export function SettingsTeamPage() {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { t } = useT()

  useEffect(() => {
    let cancelled = false
    void listMyGroups()
      .then((result) => {
        if (!cancelled) setGroups(result)
      })
      .catch((err) => {
        if (!cancelled) setError(problemDetail(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{t('equipo.title')}</h2>
        <p className="text-sm text-slate-500">{t('equipo.subtitle')}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-shell-error">
          {error}
        </p>
      ) : null}

      {groups === null && !error ? (
        <p aria-live="polite" className="text-sm text-slate-500">
          {t('equipo.loading')}
        </p>
      ) : groups && groups.length > 0 ? (
        <ul className="space-y-2">
          {groups.map((group) => (
            <li
              key={group.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3"
            >
              <span className="font-medium text-slate-900 dark:text-white">{group.name}</span>
              <Link
                className="text-sm font-semibold text-shell-link no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                to={`/groups/${group.id}/people`}
              >
                {t('equipo.viewMembers')}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-sm">
          {t('equipo.empty')}
        </div>
      )}
    </div>
  )
}
