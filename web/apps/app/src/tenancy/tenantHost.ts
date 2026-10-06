/**
 * Host-based tenancy helpers (ADR-0067).
 *
 * The slug taken from the browser `Host` is a SELECTOR, never authorization:
 * the API still verifies membership for the authenticated principal. The
 * reserved list mirrors `GroupSlug` on the server (validation symmetry); the
 * server copy is authoritative and rejects reserved/invalid slugs at creation,
 * so this client check is UX only.
 */

// Keep in sync with src/Sonivo.Domain/Tenancy/GroupSlug.cs and the host map in
// docs/03-architecture/DEPLOYMENT.md.
const RESERVED_TENANT_SLUGS = new Set<string>([
  'account', 'admin', 'api', 'app', 'assets', 'auth', 'billing', 'blog',
  'cdn', 'cuenta', 'dashboard', 'dev', 'docs', 'error', 'favicon', 'g',
  'group', 'groups', 'health', 'help', 'internal', 'join', 'login',
  'logout', 'mail', 'manifest', 'panel', 'privacy', 'register', 'robots',
  'settings', 'signup', 'sitemap', 'smtp', 'staging', 'static', 'status',
  'support', 'system', 'terms', 'test', 'www',
])

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MIN_SLUG_LENGTH = 3
const MAX_SLUG_LENGTH = 40

function rootDomain(): string {
  const configured = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'sonivo.lat'
  return configured.trim().toLowerCase().replace(/^\.+/, '')
}

/**
 * Extracts the tenant slug from a hostname, or null when the host is the apex,
 * a reserved infrastructure host, or not a single-label subdomain of the root.
 */
export function tenantSlugFromHost(hostname: string): string | null {
  const root = rootDomain()
  if (!root) return null

  const host = hostname.trim().toLowerCase().replace(/\.$/, '')
  const suffix = `.${root}`
  if (!host.endsWith(suffix)) return null

  const label = host.slice(0, host.length - suffix.length)
  if (!label || label.includes('.')) return null
  if (label.length < MIN_SLUG_LENGTH || label.length > MAX_SLUG_LENGTH) return null
  if (!SLUG_PATTERN.test(label)) return null
  if (RESERVED_TENANT_SLUGS.has(label)) return null

  return label
}
