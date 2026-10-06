import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { redeemHandoff } from '../api/client'
import { useT } from '../i18n'

/**
 * Tenant-host session handoff (ADR-0067). The apex issues a single-use,
 * short-lived code and redirects here; redeeming it sets a HOST-ONLY session
 * cookie on this host, then we reload so the app picks up the new session. No
 * parent-domain cookie is ever involved.
 */
export function HandoffPage() {
  const [params] = useSearchParams()
  const { t } = useT()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    // StrictMode mounts effects twice in development; redeem is single-use.
    if (started.current) return
    started.current = true

    const code = params.get('code') ?? ''
    if (!code) {
      setFailed(true)
      return
    }

    redeemHandoff(code)
      .then((result) => {
        window.location.replace(result.redirect || '/')
      })
      .catch(() => setFailed(true))
  }, [params])

  return (
    <div
      className="grid min-h-screen place-items-center bg-canvas px-4 text-center text-shell-foreground"
      role={failed ? 'alert' : 'status'}
      aria-live="polite"
    >
      {failed ? (
        <div className="space-y-3">
          <p className="text-lg font-semibold">{t('handoff.error')}</p>
          <Link
            className="font-semibold text-secondary-ink no-underline hover:underline"
            to="/"
          >
            {t('slug.goHome')}
          </Link>
        </div>
      ) : (
        <p className="text-lg font-semibold">{t('handoff.redeeming')}</p>
      )}
    </div>
  )
}
