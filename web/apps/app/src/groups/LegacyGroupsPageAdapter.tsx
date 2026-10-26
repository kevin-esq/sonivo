'use client'

import { useLocation, useNavigate } from 'react-router-dom'
import type { CurrentUser } from '../api/client'
import type { GroupsPageActions } from './GroupsPage'
import { GroupsPage } from './GroupsPage'

export function LegacyGroupsPageAdapter({ user, actions }: { user: CurrentUser; actions: GroupsPageActions }) {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <GroupsPage
      user={user}
      actions={actions}
      navigationMode="legacy"
      navigate={navigate}
      location={location}
    />
  )
}
