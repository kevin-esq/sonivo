'use client'

import dynamic from 'next/dynamic'

// The product SPA is mounted client-only (BrowserRouter/window). This catch-all
// keeps every existing route working while routes are migrated to the App Router.
const Mount = dynamic(() => import('@/src/Mount'), { ssr: false })

export default function CatchAllPage() {
  return <Mount />
}
