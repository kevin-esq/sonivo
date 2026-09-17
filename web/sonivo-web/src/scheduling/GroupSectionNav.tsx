import { Link } from 'react-router-dom'

export function GroupSectionNav({ groupId }: { groupId: string }) {
  return (
    <nav className="flex flex-wrap gap-4" aria-label="Group">
      <Link className="underline" to={`/groups/${groupId}`}>
        Group
      </Link>
      <Link className="underline" to={`/groups/${groupId}/library`}>
        Song library
      </Link>
      <Link className="underline" to={`/groups/${groupId}/setlists`}>
        Setlists
      </Link>
      <Link className="underline" to={`/groups/${groupId}/events`}>
        Events
      </Link>
    </nav>
  )
}
