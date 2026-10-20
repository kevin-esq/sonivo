import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { routes } from '../routing/routes'
import { tenantSlugFromHost } from './tenantHost'

/**
 * Host-based tenancy bridge (ADR-0067).
 *
 * A group workspace served at `{slug}.sonivo.lat` has no path prefix to carry
 * the slug, so the browser URL maps onto the path-tenancy routes that the SPA
 * already understands: `{slug}.sonivo.lat/library` -> `/app/g/{slug}/library`, and
 * `{slug}.sonivo.lat/login` -> `/auth/groups/{slug}/login` (the branded tenant login).
 *
 * The slug is a SELECTOR, never authorization: every downstream request is still
 * membership-checked server-side by `GroupSlugResolver` and the API.
 *
 * `/auth/session/handoff` is deliberately NOT bridged. Redeeming the one-time code
 * must happen on the tenant host itself so the host-only session cookie is
 * written for that host; bridging it would move the cookie to the wrong host.
 */
const HANDOFF_PATH = routes.handoff

export function TenantHostRedirect() {
  const location = useLocation()
  const navigate = useNavigate()
  const lastRewrite = useRef<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const slug = tenantSlugFromHost(window.location.hostname)
    // No slug: the apex (marketing/auth), app host, account host or plain
    // localhost. Those keep serving their own routes untouched.
    if (!slug) return

    const { pathname, search, hash } = location
    const bridged = routes.groupSlug(slug)

    // Already bridged (or an explicit apex/handoff route): nothing to do.
    if (pathname === bridged || pathname.startsWith(`${bridged}/`)) return
    if (pathname === HANDOFF_PATH || pathname.startsWith(`${HANDOFF_PATH}/`) || pathname === '/session/handoff') return
    if (pathname === routes.auth || (pathname.startsWith(`${routes.auth}/`) && pathname !== routes.login)) return
    if (pathname === routes.app || pathname.startsWith(`${routes.app}/`)) return

    const target = `${pathname === routes.login || pathname === '/login' ? routes.brandedLogin(slug) : pathname === routes.app || pathname === '/' ? bridged : `${bridged}${pathname}`}${search}${hash}`
    // Guard against a rewrite loop: identical target means we already tried.
    if (lastRewrite.current === target) return
    lastRewrite.current = target

    navigate(target, { replace: true })
  }, [location, navigate])

  return null
}
