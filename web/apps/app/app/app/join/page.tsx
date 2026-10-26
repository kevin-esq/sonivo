'use client'

import { JoinGroupPage } from '@/src/tenancy/JoinGroupPage'

export default function ProductJoinPage() {
  return <JoinGroupPage navigate={(to) => window.location.assign(to)} />
}
