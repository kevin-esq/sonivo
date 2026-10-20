import { routes } from '../routing/routes'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { listMyGroups, getPublicBranding, type CurrentUser, type PublicBranding } from '../api/client'
import { useT } from '../i18n'
import { GuestAuthRoute } from './AuthScreen'

/**
 * Branded group access screen at /auth/groups/{slug}/login (ADR-0048 D1). Same
 * authentication — only the presentation changes. The public branding read is
 * uniform (unknown slug and unbranded group return the same empty payload),
 * so no enumeration.
 *
 * UX rules this screen owns (owner direction):
 * - The Sonivo brand is NOT shown here: the group's own identity leads, because
 *   this is the group's door, not Sonivo's.
 * - "Create an account" is not offered: joining a group is by invitation, not
 *   self-registration.
 * - Signing in with an account that does not belong to this group says so in
 *   group terms (never "tenant") and sends the person back to the general
 *   session instead of trapping them in a place they cannot enter.
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
  const [rejected, setRejected] = useState(false)
  const [checking, setChecking] = useState(false)

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

  /**
   * Membership is checked AFTER a successful sign-in, never before: doing it
   * earlier would turn this screen into an oracle for who belongs to the group.
   * The API remains the authority — this only decides which screen to show.
   */
  async function handleSuccess(signedIn: CurrentUser) {
    if (!slug) {
      onSuccess(signedIn)
      return
    }
    setChecking(true)
    try {
      const groups = await listMyGroups()
      const belongs = groups.some(
        (group) =>
          group.slug?.toLowerCase() === slug.toLowerCase(),
      )
      if (belongs) {
        onSuccess(signedIn)
        return
      }
      // Signed in, but not a member of THIS group. Keep the session and explain,
      // rather than dropping them into a group workspace the API will refuse.
      setRejected(true)
      onSuccess(signedIn)
    } catch {
      // Fail open: let the group routes (and the API) enforce membership.
      onSuccess(signedIn)
    } finally {
      setChecking(false)
    }
  }

  if (rejected) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-5 py-10 text-ink">
        <div className="w-full max-w-md space-y-5 rounded-2xl border border-border-subtle bg-surface p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.12)] sm:p-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {t('slug.notMemberTitle')}
            </h1>
            <p className="text-sm text-muted">
              {t('slug.notMemberBody', { name: branding?.name ?? slug ?? '' })}
            </p>
          </div>
          <Link
            to={routes.home}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-primary-strong px-5 text-sm font-semibold text-primary-foreground no-underline shadow-sm transition hover:bg-primary-strong/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t('slug.goToSonivo')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-canvas"
      data-testid={hasBrand ? 'branded-login-branded' : 'branded-login-plain'}
      style={
        hasBrand
          ? ({
              // Scoped to this subtree only: a brand must never leak into
              // :root, or it would follow the user out of the group.
              '--brand-primary': branding?.accentHex ?? undefined,
              '--brand-logo-url': branding?.logoUrl
                ? `url(${branding.logoUrl})`
                : undefined,
            } as React.CSSProperties)
          : undefined
      }
    >
      {hasBrand ? (
        <a
          href="#auth-form"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
        >
          {t('slug.skipToLogin')}
        </a>
      ) : null}
      <div id="auth-form">
        <GuestAuthRoute
          user={user}
          mode="login"
          onSuccess={handleSuccess}
          brand={hasBrand ? branding : null}
        />
      </div>
      {checking ? (
        <p role="status" aria-live="polite" className="sr-only">
          {t('state.loading')}
        </p>
      ) : null}
    </div>
  )
}
