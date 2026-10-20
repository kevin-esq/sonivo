'use client'

import dynamic from 'next/dynamic'

// The product SPA is mounted client-only (BrowserRouter/window). In dev and
// the production server, a catch-all rewrite serves this page for deep links.
// The staging static export relies on the .NET host's index.html fallback.
const Mount = dynamic(() => import('@/src/Mount'), { ssr: false })

export default function Page() {
  return <Mount />
}
