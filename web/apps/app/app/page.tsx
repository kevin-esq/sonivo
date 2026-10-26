'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { routes } from '@/src/routing/routes'
import { SessionScreen } from '@/src/shell/GroupsChrome'
import { useT } from '@/src/i18n'

// The product SPA is mounted client-only (BrowserRouter/window). In dev and
// the production server, a catch-all rewrite serves this page for deep links.
// The staging static export relies on the .NET host's index.html fallback.
const Mount = dynamic(() => import('@/src/Mount'), { ssr: false })

export default function Page() {
  if (process.env.NEXT_EXPORT === '1') return <Mount />
  return <ProductRootRedirect />
}

function ProductRootRedirect() {
  const router = useRouter()
  const { t } = useT()
  useEffect(() => router.replace(routes.home), [router])
  return <SessionScreen message={t('state.loading')} />
}
