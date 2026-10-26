'use client'

import dynamic from 'next/dynamic'

// Transitional adapter: unmigrated routes still use BrowserRouter hooks.
// Keep that runtime isolated to route segments that have not been decomposed.
const Mount = dynamic(() => import('@/src/Mount'), { ssr: false })

export function LegacyRouterBridge() {
  return <Mount />
}
