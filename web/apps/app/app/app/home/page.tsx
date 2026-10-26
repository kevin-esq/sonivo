'use client'

import { HomePage } from '@/src/home/HomePage'
import { useAppRuntime } from '@/src/appRuntime/context'
import { useRouter } from 'next/navigation'

export default function ProductHomePage() {
  const { session } = useAppRuntime()
  const router = useRouter()
  if (session.status !== 'authenticated') return null
  return <HomePage user={session.user} navigationMode="next" navigate={(to) => router.push(to)} />
}
