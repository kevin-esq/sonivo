'use client'

import dynamic from 'next/dynamic'
import { useAppRuntime } from '@/src/appRuntime/context'
import { MarketingPage } from '@/src/marketing/MarketingPage'

// Preserve the .NET static-export bridge while request-aware Next serves the
// public marketing page and can reflect the current cookie-backed session.
const Mount = dynamic(() => import('@/src/Mount'), { ssr: false })

export function RootPageContent() {
  if (process.env.NEXT_EXPORT === '1') return <Mount />
  const { user } = useAppRuntime()
  return <MarketingPage user={user} />
}
