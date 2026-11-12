'use client'

import { useEffect, useState } from 'react'
import { fetchTwoFactorStatus, problemDetail, type TwoFactorStatus } from '../api/client'
import { useT } from '../i18n'
import { PasswordSection } from './security/PasswordSection'
import { TwoFactorSection } from './security/TwoFactorSection'
import { PasskeysSection } from './security/PasskeysSection'
import { AccountActivitySection } from './security/AccountActivitySection'
import { IdentitySessionsCard } from './account/IdentitySessionsCard'
import { AccountCard } from './account/AccountCard'
import { AccountSettingsLayout } from './account/AccountSettingsLayout'

export function SecurityPage() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { t } = useT()

  async function refresh() {
    try {
      setError(null)
      setStatus(await fetchTwoFactorStatus())
    } catch (err) {
      setError(problemDetail(err, t))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <AccountSettingsLayout active="security" title={t('security.title')} description={t('security.subtitle')}>
      {error ? (
        <p role="alert" className="rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error-ink">
          {error}
        </p>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {loading ? (
          <AccountCard title={t('security.totpTitle')}>
            <p aria-live="polite" className="px-2 py-3 text-sm text-muted">{t('state.loading')}</p>
          </AccountCard>
        ) : status ? <TwoFactorSection status={status} onStatusChanged={refresh} /> : null}
        <PasswordSection hasPassword={status?.hasPassword} />
        <PasskeysSection />
        <IdentitySessionsCard />
        <AccountActivitySection />
      </div>
    </AccountSettingsLayout>
  )
}
