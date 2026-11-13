'use client'

import { SettingsProfilePage } from '@/src/shell/settings/SettingsPages'
import { useAppRuntime } from '@/src/appRuntime/context'

export default function AccountProfilePage() {
  const { session, onUserChange } = useAppRuntime()
  if (session.status !== 'authenticated') return null
  return <SettingsProfilePage user={session.user} onUserChange={onUserChange} />
}
