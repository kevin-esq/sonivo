import { useEffect, useState } from 'react'
import { fetchTwoFactorStatus, problemDetail, type TwoFactorStatus } from '../api/client'
import { useT } from '../i18n'
import { PasswordSection } from './security/PasswordSection'
import { TwoFactorSection } from './security/TwoFactorSection'
import { PasskeysSection } from './security/PasskeysSection'

export function SecurityPage() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { t } = useT()

  async function refresh() {
    try {
      const s = await fetchTwoFactorStatus()
      setStatus(s)
    } catch (err) {
      setError(problemDetail(err))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{t('seguridad.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('seguridad.subtitle')}
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <PasswordSection hasPassword={status?.hasPassword} />
      <TwoFactorSection status={status} onStatusChanged={refresh} />
      <PasskeysSection />
    </div>
  )
}
