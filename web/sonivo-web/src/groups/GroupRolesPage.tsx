import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../shell/authContext'
import { PeoplePage } from '../tenancy/PeoplePage'

/**
 * W-E — `/roles` is the Members screen filtered by role (ADR-0055). The role comes
 * from the `?role=` query param (`admins` | `leaders` | `members`); `all` shows everyone.
 */
export function GroupRolesPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const role = params.get('role') ?? 'all'
  if (!user) return null
  return <PeoplePage user={user} roleFilter={role} />
}
