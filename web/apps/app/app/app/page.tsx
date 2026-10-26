'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { routes } from '@/src/routing/routes'
import { SessionScreen } from '@/src/shell/GroupsChrome'
import { useT } from '@/src/i18n'

export default function ProductIndexPage() {
  const router = useRouter()
  const { t } = useT()
  useEffect(() => router.replace(routes.home), [router])
  return <SessionScreen message={t('state.loading')} />
}
