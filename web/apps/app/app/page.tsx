'use client'

import dynamic from 'next/dynamic'

// The product SPA is mounted client-only (BrowserRouter/window). In dev a
// catch-all rewrite serves this page for deep links; in the static production
// export the .NET host falls back to index.html for unknown routes.
const Mount = dynamic(() => import('@/src/Mount'), { ssr: false })

export default function Page() {
  return <Mount />
}
