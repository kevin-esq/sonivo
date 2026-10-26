'use client'

import dynamic from 'next/dynamic'

const Mount = dynamic(() => import('@/src/Mount'), { ssr: false })

export function LegacyFallbackContent() {
  return <Mount />
}
