'use client'

import { AccountOverviewPage } from '@/src/shell/account/AccountOverviewPage'
import { useAppRuntime } from '@/src/appRuntime/context'

export default function ProductAccountPage() {
  const { session } = useAppRuntime()
  if (session.status !== 'authenticated') return null
  return <AccountOverviewPage displayName={session.user.displayName?.trim() || session.user.email || ''} />
}
