'use client'

import { useSearchParams } from 'next/navigation'
import { GroupsPage } from '@/src/groups/GroupsPage'
import type { GroupsPageLocation, GroupsPageNavigate } from '@/src/groups/GroupsPage'
import { groupsPageActions } from '@/src/groups/groupPageActions'
import { useAppRuntime } from '@/src/appRuntime/context'
import { SessionScreen } from '@/src/shell/GroupsChrome'
import { useT } from '@/src/i18n'

export function ProductGroupsContent() {
  const { session } = useAppRuntime()
  const searchParams = useSearchParams()
  const { t } = useT()
  if (session.status !== 'authenticated') return <SessionScreen message={t('state.checkingSession')} />
  const location: GroupsPageLocation = {
    pathname: '/app/groups',
    search: searchParams.toString() ? `?${searchParams.toString()}` : '',
    hash: '',
    state: null,
  }
  const navigate: GroupsPageNavigate = (to) => window.location.assign(to)
  return (
    <GroupsPage
      user={session.user}
      actions={groupsPageActions}
      navigationMode="next"
      navigate={navigate}
      location={location}
      initialCreate={searchParams.get('create') === '1'}
    />
  )
}
