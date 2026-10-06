import type { NextConfig } from 'next'

// The .NET API is the only backend. In dev/CI, Next proxies /api and /hubs to it
// and falls back to the SPA shell for deep links; the production build is a
// static export served by the .NET host at the same origin (no proxy needed).
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:5171'
const isExport = process.env.NEXT_EXPORT === '1'

const nextConfig: NextConfig = {
  // StrictMode's dev-only double-mount races with the group create modals in
  // dev (the route remounts mid-interaction and the dialog state is lost), which
  // made Playwright E2E flaky. StrictMode never double-invokes effects in
  // production, so disabling it only affects the dev aid, not shipped behavior.
  reactStrictMode: false,
  transpilePackages: ['@sonivo/i18n', '@sonivo/api-client', '@sonivo/ui'],
  // Bridge (parity migration): the ported SPA is checked by its own tsconfig;
  // Next type/lint gating is re-enabled once the SPA is decomposed.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  output: isExport ? 'export' : undefined,
  images: { unoptimized: true },
  async rewrites() {
    if (isExport) {
      return []
    }
    return {
      beforeFiles: [
        { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
        { source: '/hubs/:path*', destination: `${apiOrigin}/hubs/:path*` },
      ],
      // Deep links (e.g. /grupos) resolve to the SPA shell in dev/CI.
      afterFiles: [{ source: '/:path*', destination: '/' }],
      fallback: [],
    }
  },
}

export default nextConfig
