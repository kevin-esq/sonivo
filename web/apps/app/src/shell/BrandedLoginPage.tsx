import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicBranding, type CurrentUser, type PublicBranding } from '../api/client'
import { useT } from '../i18n'
import { GuestAuthRoute } from './AuthScreen'

/**
 * Branded access screen at /g/{slug}/login (ADR-0048 D1). Same authentication —
 * only the presentation changes. The public branding read is uniform (unknown
 * slug and unbranded group return the same empty payload), so no enumeration.
 */
export function BrandedLoginPage({
  user,
  onSuccess,
}: {
  user: CurrentUser | null | undefined
  onSuccess: (user: CurrentUser) => void
}) {
  const { slug } = useParams()
  const { t } = useT()
  const [branding, setBranding] = useState<PublicBranding | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!slug) return
    getPublicBranding(slug)
      .then((value) => {
        if (!cancelled) setBranding(value)
      })
      .catch(() => {
        if (!cancelled) setBranding(null)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const hasBrand = Boolean(branding?.name)

  return (
    <div className="min-h-screen bg-canvas">
      {hasBrand ? (
        <div
          className="flex items-center justify-center gap-3 px-4 py-4 text-white"
          style={{ backgroundColor: branding?.accentHex ?? '#5b4bd6' }}
          data-testid="branded-login-banner"
        >
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain" />
          ) : null}
          <div className="text-center">
            <p className="text-lg font-semibold">{branding?.name}</p>
            {branding?.loginHeadline ? (
              <p className="text-sm text-white/85">{branding.loginHeadline}</p>
            ) : (
              <p className="text-sm text-white/85">{t('slug.brandedLoginHint')}</p>
            )}
          </div>
        </div>
      ) : null}
      <GuestAuthRoute user={user} mode="login" onSuccess={onSuccess} />
    </div>
  )
}
