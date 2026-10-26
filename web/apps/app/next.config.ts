import type { NextConfig } from 'next'
import { legacyGroupRouteRedirects, legacyRouteRedirects } from './src/routing/routes'

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
  // Keep production builds behind the app's TypeScript contract even while
  // routes are being migrated from the React Router bridge.
  eslint: { ignoreDuringBuilds: true },
  output: isExport ? 'export' : undefined,
  images: { unoptimized: true },
  ...(!isExport && {
    async redirects() {
      return [
        ...legacyRouteRedirects.map(({ from, to }) => ({ source: from, destination: to, permanent: true })),
        { source: '/groups/:groupId/:path*', destination: '/app/groups/:groupId/:path*', permanent: true },
        { source: '/join/:token', destination: '/app/join/:token', permanent: true },
        { source: '/g/:slug/login', destination: '/auth/groups/:slug/login', permanent: true },
        { source: '/g/:slug/:path*', destination: '/app/g/:slug/:path*', permanent: true },
        { source: '/g/:slug', destination: '/app/g/:slug', permanent: true },
        ...legacyGroupRouteRedirects.map(({ from, to }) => ({
          source: `/app/groups/:groupId/${from}/:path*`,
          destination: `/app/groups/:groupId/${to}/:path*`,
          permanent: true,
        })),
      ]
    },
    async headers() {
      return [
        {
          source: '/:path*',
          headers: [
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'X-Frame-Options', value: 'DENY' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
            { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          ],
        },
        {
          source: '/app/:path*',
          headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
        },
        {
          source: '/auth/:path*',
          headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
        },
      ]
    },
  }),
  ...(!isExport && {
    async rewrites() {
      return {
        beforeFiles: [
          { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
          { source: '/connect/:path*', destination: `${apiOrigin}/connect/:path*` },
          { source: '/.well-known/openid-configuration', destination: `${apiOrigin}/.well-known/openid-configuration` },
          { source: '/hubs/:path*', destination: `${apiOrigin}/hubs/:path*` },
          { source: '/g/:slug/manifest.webmanifest', destination: `${apiOrigin}/g/:slug/manifest.webmanifest` },
        ],
        // Unknown paths retain the SPA bridge in dev/CI while the remaining
        // product routes are migrated into the App Router.
        afterFiles: [{ source: '/:path*', destination: '/' }],
        fallback: [],
      }
    },
  }),
}

export default nextConfig
