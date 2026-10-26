'use client'

import { useParams } from 'next/navigation'
import { useAppRuntime } from '../appRuntime/context'
import { BrandedLoginPage } from '../shell/BrandedLoginPage'

export function BrandedLoginAppPage() {
  const { slug } = useParams<{ slug: string }>()
  const { guestUser, onAuthSuccess } = useAppRuntime()
  return <BrandedLoginPage user={guestUser} onSuccess={onAuthSuccess} slug={slug} navigationMode="next" />
}
