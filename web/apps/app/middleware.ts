import { NextResponse, type NextRequest } from 'next/server'
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, type Locale } from '@sonivo/i18n/config'

// Reserved labels that must never be treated as a tenant slug.
const RESERVED = new Set([
  'www',
  'api',
  'app',
  'admin',
  'static',
  'assets',
  'cdn',
  'mail',
  'auth',
  'hubs',
])

const TENANT_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function rootDomain(): string {
  return (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'sonvo.lat').toLowerCase()
}

/**
 * Extracts the tenant slug from the request host. The host header is used only
 * to select a route; it is never treated as authorization (OWASP Multi-Tenant).
 * Unknown hosts (localhost, preview domains) fall back to apex behaviour.
 */
function tenantFromHost(hostHeader: string | null): string | null {
  if (!hostHeader) return null
  const host = hostHeader.split(':')[0]?.toLowerCase() ?? ''
  const root = rootDomain()
  if (host === root || host === `www.${root}`) return null
  if (!host.endsWith(`.${root}`)) return null

  const label = host.slice(0, -(root.length + 1))
  if (!label || label.includes('.') || RESERVED.has(label) || !TENANT_SLUG.test(label)) {
    return null
  }
  return label
}

function resolveLocale(request: NextRequest): Locale {
  const fromCookie = request.cookies.get(LOCALE_COOKIE)?.value
  if (fromCookie && (LOCALES as readonly string[]).includes(fromCookie)) {
    return fromCookie as Locale
  }

  const acceptLanguage = request.headers.get('accept-language') ?? ''
  for (const part of acceptLanguage.split(',')) {
    const base = part.split(';')[0]?.trim().toLowerCase().split('-')[0]
    if (base && (LOCALES as readonly string[]).includes(base)) {
      return base as Locale
    }
  }

  return DEFAULT_LOCALE
}

const LOCALE_COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 365,
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  const tenant = tenantFromHost(request.headers.get('host'))
  const locale = resolveLocale(request)

  // Propagate the resolved context to Server Components. Setting request
  // headers (not response headers) is what makes `headers()` see them.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-locale', locale)
  if (tenant) {
    requestHeaders.set('x-tenant-slug', tenant)
  }

  if (!tenant) {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    response.cookies.set(LOCALE_COOKIE, locale, LOCALE_COOKIE_OPTIONS)
    return response
  }

  // slug.sonvo.lat/rehearsals -> /{tenant}/{locale}/rehearsals (internal only).
  const url = request.nextUrl.clone()
  url.pathname = `/${tenant}/${locale}${pathname === '/' ? '' : pathname}`

  const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } })
  response.cookies.set(LOCALE_COOKIE, locale, LOCALE_COOKIE_OPTIONS)
  return response
}

export const config = {
  // Exclude the API/hub proxies, Next internals and static files.
  matcher: ['/((?!api|hubs|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
