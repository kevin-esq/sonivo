import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CurrentUser } from '../api/client'
import { fetchCurrentUser, logoutUser, startHandoff } from '../api/client'
import { installGlobalErrorHandlers } from '../diagnostics/clientTelemetry'
import { appHost, isApexHost, tenantSlugFromHost } from '../tenancy/tenantHost'
import { routes } from '../routing/routes'

export type SessionState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'guest' }
  | { status: 'authenticated'; user: CurrentUser }

export function useAppSession() {
  const [session, setSession] = useState<SessionState>({ status: 'loading' })

  const loadSession = useCallback(async (signal?: { cancelled: boolean }) => {
    setSession({ status: 'loading' })
    try {
      const current = await fetchCurrentUser()
      if (signal?.cancelled) return
      setSession(current ? { status: 'authenticated', user: current } : { status: 'guest' })
    } catch {
      if (!signal?.cancelled) setSession({ status: 'error' })
    }
  }, [])

  useEffect(() => {
    const signal = { cancelled: false }
    void loadSession(signal)
    return () => {
      signal.cancelled = true
    }
  }, [loadSession])

  useEffect(() => installGlobalErrorHandlers(), [])

  useEffect(() => {
    const slug = tenantSlugFromHost(window.location.hostname)
    if (!slug) return
    const { pathname, search } = window.location
    if (pathname.startsWith(`${routes.app}/g/`) || pathname === routes.handoff || pathname === '/session/handoff') return
    if (pathname === routes.auth || (pathname.startsWith(`${routes.auth}/`) && pathname !== routes.login)) return
    if (pathname === routes.app) {
      window.location.replace(`${routes.groupSlug(slug)}${search}`)
      return
    }
    if (pathname.startsWith(`${routes.app}/`)) return
    const target = pathname === routes.login || pathname === '/login'
      ? routes.brandedLogin(slug)
      : `${routes.groupSlug(slug)}${pathname === '/' ? '' : pathname}`
    window.location.replace(`${target}${search}`)
  }, [])

  useEffect(() => {
    if (session.status !== 'authenticated') return
    const target = appHost()
    if (!target || !isApexHost(window.location.hostname)) return

    const guard = 'sonivo:handoff:app'
    try {
      if (window.sessionStorage.getItem(guard) === '1') return
      window.sessionStorage.setItem(guard, '1')
    } catch {
      // Storage unavailable; proceed once.
    }

    void startHandoff()
      .then((result) => {
        window.location.replace(result.redirect || `https://${target}${routes.home}`)
      })
      .catch(() => {
        // Stay on the apex; the user can retry by reloading.
      })
  }, [session.status])

  const onLogout = useCallback(() => {
    void (async () => {
      try {
        await logoutUser()
      } finally {
        setSession({ status: 'guest' })
      }
    })()
  }, [])

  const onAuthSuccess = useCallback((user: CurrentUser | null) => {
    setSession(user ? { status: 'authenticated', user } : { status: 'guest' })
  }, [])

  const onUserChange = useCallback((user: CurrentUser) => {
    setSession({ status: 'authenticated', user })
  }, [])

  const user = session.status === 'authenticated' ? session.user : null
  const guestUser = useMemo(
    () => (session.status === 'loading' ? undefined : user),
    [session.status, user],
  )

  return {
    session,
    user,
    guestUser,
    onLogout,
    onRetry: () => void loadSession(),
    onUserChange,
    onAuthSuccess,
  }
}
