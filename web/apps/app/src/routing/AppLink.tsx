'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useContext, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { NavLink as LegacyNavLink, Link as LegacyLink } from 'react-router-dom'

export type NavigationMode = 'legacy' | 'next'
const NavigationModeContext = createContext<NavigationMode>('legacy')

export function AppNavigationProvider({ mode, children }: { mode: NavigationMode; children: ReactNode }) {
  return <NavigationModeContext.Provider value={mode}>{children}</NavigationModeContext.Provider>
}

const NEXT_OWNED_PATHS = new Set([
  '/app/home',
  '/app/groups',
  '/app/groups/',
  '/app/join',
  '/app/help',
  '/app/plans',
  '/app/calendar',
  '/app/account/notifications',
  '/app/account',
  '/app/account/preferences',
  '/app/account/security',
  '/app/account/membership',
  '/auth/login',
  '/auth/register',
  '/auth/confirm',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/session/handoff',
])

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className'> & {
  to: string
  mode?: NavigationMode
  children: ReactNode
  className?: string
}

/** Keeps route ownership explicit while the product migrates between routers. */
export function AppLink({ mode, to, children, ...props }: AppLinkProps) {
  const inheritedMode = useContext(NavigationModeContext)
  const activeMode = mode ?? inheritedMode
  if (activeMode === 'next') {
    const routePath = to.split(/[?#]/, 1)[0] ?? to
    if (!NEXT_OWNED_PATHS.has(routePath) && !isNextOwnedRoute(routePath)) return <a href={to} {...props}>{children}</a>
    return <Link href={to} {...props}>{children}</Link>
  }
  return <LegacyLink to={to} {...props}>{children}</LegacyLink>
}

function isNextOwnedRoute(pathname: string) {
  return /^\/app\/groups\/[^/]+(?:\/|$)/.test(pathname)
}

type ActiveState = { isActive: boolean }
type AppNavLinkProps = Omit<AppLinkProps, 'className'> & {
  end?: boolean
  className?: string | ((state: ActiveState) => string | undefined)
}

export function AppNavLink({ mode, to, end, className, children, ...props }: AppNavLinkProps) {
  const inheritedMode = useContext(NavigationModeContext)
  const activeMode = mode ?? inheritedMode
  if (activeMode === 'next') {
    return <NextNavLink to={to} end={end} className={className} mode={activeMode} {...props}>{children}</NextNavLink>
  }
  return (
    <LegacyNavLink to={to} end={end} className={className as never} {...props}>
      {children}
    </LegacyNavLink>
  )
}

function NextNavLink({ to, end, className, children, mode, ...props }: AppNavLinkProps) {
  const pathname = usePathname() ?? ''
  const isActive = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
  const resolvedClass = typeof className === 'function' ? className({ isActive }) : className
  return <AppLink mode={mode} to={to} aria-current={isActive ? 'page' : undefined} className={resolvedClass} {...props}>{children}</AppLink>
}
