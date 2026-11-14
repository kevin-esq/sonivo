'use client'

import { JoinGroupPage } from '@/src/tenancy/JoinGroupPage'
import { AppNavigationProvider } from '@/src/routing/AppLink'

export default function ProductJoinPage() {
  return (
    <AppNavigationProvider mode="next">
      <JoinGroupPage navigate={(to) => window.location.assign(to)} />
    </AppNavigationProvider>
  )
}
