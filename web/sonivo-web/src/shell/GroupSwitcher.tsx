import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { listMyGroups, type GroupSummary } from '../api/client'
import { useT } from '../i18n'
import { readLastGroup } from '../tenancy/groupSlug'

/**
 * Header group switcher (ADR-0048): the current group first, then the last one
 * opened, then the rest by name. Hidden when the user has a single group.
 */
export function GroupSwitcher({ currentGroupId }: { currentGroupId: string }) {
  const { t } = useT()
  const navigate = useNavigate()
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)

  useEffect(() => {
    let cancelled = false
    listMyGroups()
      .then((items) => {
        if (!cancelled) setGroups(items)
      })
      .catch(() => {
        if (!cancelled) setGroups([])
      })
    return () => {
      cancelled = true
    }
  }, [currentGroupId])

  if (!groups || groups.length <= 1) return null

  const last = readLastGroup()
  const ordered = [...groups].sort((a, b) => {
    if (a.id === currentGroupId) return -1
    if (b.id === currentGroupId) return 1
    if (a.id === last) return -1
    if (b.id === last) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <details className="relative" data-testid="group-switcher">
      <summary
        aria-label={t('workspace.switchGroup')}
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-sm font-medium text-ink hover:bg-neutral-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary [&::-webkit-details-marker]:hidden"
      >
        <span className="hidden sm:inline">{t('workspace.switchGroup')}</span>
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </summary>
      <ul className="absolute right-0 z-50 mt-1 max-h-72 min-w-48 overflow-y-auto rounded-xl border border-border-subtle bg-surface p-1 text-ink shadow-lg">
        {ordered.map((group) => (
          <li key={group.id}>
            <button
              type="button"
              onClick={() => navigate(`/groups/${group.id}`)}
              className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-ink hover:bg-neutral-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              <span className="truncate">{group.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
