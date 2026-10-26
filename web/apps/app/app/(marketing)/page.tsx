'use client'

import dynamic from 'next/dynamic'
import { MarketingPage } from '@/src/marketing/MarketingPage'
import { useAppRuntime } from '@/src/appRuntime/context'

// Keep the .NET static-export parity bridge while the request-aware Next
// deployment serves the public marketing page through the App Router.
const Mount = dynamic(() => import('@/src/Mount'), { ssr: false })

export default function Page() {
  if (process.env.NEXT_EXPORT === '1') return <Mount />
  const { user } = useAppRuntime()
  return <MarketingPage user={user} />
}
