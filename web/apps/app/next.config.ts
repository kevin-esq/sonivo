import type { NextConfig } from 'next'

// The .NET API is the only backend. Dev/CI and the Vercel production server
// proxy API, hubs, and the public group manifest to it. NEXT_EXPORT=1 is the
// staging parity bridge: the .NET host serves that export at the same origin.
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:5171'
const isExport = process.env.NEXT_EXPORT === '1'

const nextConfig: NextConfig = {
  // Allow isolated browser checks to keep their build output separate from the
  // developer's active Next.js server (`NEXT_DIST_DIR=.next-e2e`).
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // StrictMode's dev-only double-mount races with the group create modals in
  // dev (the route remounts mid-interaction and the dialog state is lost), which
  // made Playwright E2E flaky. StrictMode never double-invokes effects in
  // production, so disabling it only affects the dev aid, not shipped behavior.
  reactStrictMode: false,
  transpilePackages: ['@sonivo/i18n', '@sonivo/api-client', '@sonivo/ui', '@sonivo/routes'],
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
        { source: '/connect/:path*', destination: `${apiOrigin}/connect/:path*` },
        { source: '/.well-known/openid-configuration', destination: `${apiOrigin}/.well-known/openid-configuration` },
        { source: '/hubs/:path*', destination: `${apiOrigin}/hubs/:path*` },
        { source: '/g/:slug/manifest.webmanifest', destination: `${apiOrigin}/g/:slug/manifest.webmanifest` },
      ],
      // Deep links (e.g. /groups) resolve to the SPA shell in dev/CI.
      afterFiles: [{ source: '/:path*', destination: '/' }],
      fallback: [],
    }
  },
}

export default nextConfig
