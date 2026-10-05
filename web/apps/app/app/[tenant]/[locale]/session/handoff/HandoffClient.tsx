'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { redeemHandoff } from '@sonivo/api-client/client'
import { useT } from '@sonivo/i18n/I18nProvider'

/**
 * Redeems the single-use handoff code on the tenant host. The code is consumed
 * immediately on mount via POST (same-origin, CSRF header), then the browser is
 * sent to the returned path. Errors are generic (ADR-0067).
 */
export function HandoffClient() {
  const searchParams = useSearchParams()
  const { t } = useT()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) {
      setFailed(true)
      return
    }

    let cancelled = false
    redeemHandoff(code)
      .then((result) => {
        if (!cancelled) {
          window.location.assign(result.redirect || '/')
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [searchParams])

  return (
    <main role="status" aria-live="polite">
      <p>{failed ? t('handoff.error') : t('handoff.redeeming')}</p>
    </main>
  )
}
