'use client'

import { GuestAuthRoute } from '../shell/AuthScreen'
import { useAppRuntime } from '../appRuntime/context'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { guestUser, onAuthSuccess } = useAppRuntime()
  return <GuestAuthRoute user={guestUser} mode={mode} onSuccess={onAuthSuccess} />
}
