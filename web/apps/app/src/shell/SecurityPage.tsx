import { useEffect, useState } from 'react'
import { fetchTwoFactorStatus, problemDetail, type TwoFactorStatus } from '../api/client'
import { useT } from '../i18n'
import { PasswordSection } from './security/PasswordSection'
import { TwoFactorSection } from './security/TwoFactorSection'
import { PasskeysSection } from './security/PasskeysSection'
import { AccountActivitySection } from './security/AccountActivitySection'

export function SecurityPage() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { t } = useT()

  async function refresh() {
    try {
      const s = await fetchTwoFactorStatus()
      setStatus(s)
    } catch (err) {
      setError(problemDetail(err, t))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <div className="security-page mx-auto max-w-4xl space-y-6">
      <header className="space-y-1.5 border-b border-border-subtle pb-5">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t('security.title')}</h1>
        <p className="text-muted">
          {t('security.subtitle')}
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error-ink">
          {error}
        </p>
      ) : null}

      <PasswordSection hasPassword={status?.hasPassword} />
      <TwoFactorSection status={status} onStatusChanged={refresh} />
      <PasskeysSection />
      <AccountActivitySection />
    </div>
  )
}
