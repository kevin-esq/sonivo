import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@sonivo/i18n', '@sonivo/routes'],
}

export default nextConfig
