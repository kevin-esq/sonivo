import type { NextConfig } from 'next'

// The .NET API is the only backend. All browser traffic is same-origin to the
// Next host and proxied to the API, mirroring the Vite dev proxy (ADR-0067).
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:5171'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sonivo/i18n', '@sonivo/api-client', '@sonivo/ui'],
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      { source: '/hubs/:path*', destination: `${apiOrigin}/hubs/:path*` },
    ]
  },
}

export default nextConfig
