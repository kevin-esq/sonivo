import { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'
import { listAccountAudit, type AccountAuditEntry } from '../../api/client'
import { useT, type I18nKey } from '../../i18n'
import { problemDetail } from '../../api/client'

const ACTION_KEYS: Record<string, I18nKey> = {
  access_created: 'accountAudit.action.accessCreated',
  access_reset: 'accountAudit.action.accessReset',
  linked: 'accountAudit.action.linked',
  removed: 'accountAudit.action.removed',
  password_changed: 'accountAudit.action.passwordChanged',
  owner_transferred: 'accountAudit.action.ownerTransferred',
  passkey_added: 'accountAudit.action.passkeyAdded',
  passkey_removed: 'accountAudit.action.passkeyRemoved',
}

/** Recent security events for the signed-in account (ADR-0047). */
export function AccountActivitySection() {
  const { t } = useT()
  const [entries, setEntries] = useState<AccountAuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void listAccountAudit()
      .then((items) => {
        if (!cancelled) setEntries(items)
      })
      .catch((err) => {
        if (!cancelled) {
          setEntries([])
          setError(problemDetail(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  function label(action: string): string {
    const key = ACTION_KEYS[action]
    return key ? t(key) : action
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
        <Activity className="h-5 w-5 text-primary-ink" aria-hidden="true" />
        {t('accountAudit.title')}
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">{t('accountAudit.subtitle')}</p>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : entries === null ? (
        <p aria-live="polite" className="text-sm text-slate-500 dark:text-slate-400">
          {t('accountAudit.loading')}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('accountAudit.empty')}</p>
      ) : (
        <ul className="space-y-1.5" data-testid="account-activity">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800"
            >
              <span className="text-sm text-slate-900 dark:text-white">{label(entry.action)}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
