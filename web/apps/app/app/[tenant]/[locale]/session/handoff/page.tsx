import { Suspense } from 'react'
import type { Metadata } from 'next'
import { HandoffClient } from './HandoffClient'

// The handoff page carries a one-time code in the URL: never index it, never
// leak it via Referer, never cache it (draft-moros-oauth-browser-session-handoff).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function HandoffPage() {
  return (
    <Suspense fallback={null}>
      <HandoffClient />
    </Suspense>
  )
}
