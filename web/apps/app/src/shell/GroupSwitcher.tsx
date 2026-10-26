import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { listMyGroups, type GroupSummary } from '../api/client'
import { useT } from '../i18n'
import { readLastGroup } from '../tenancy/groupSlug'
import { routes } from '../routing/routes'

/**
 * Header group switcher (ADR-0048): the current group first, then the last one
 * opened, then the rest by name. Hidden when the user has a single group.
 */
export function GroupSwitcher({ currentGroupId, currentGroupName, navigate }: { currentGroupId: string; currentGroupName: string; navigate: (to: string) => void }) {
  const { t } = useT()
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

  const last = readLastGroup()
  const ordered = [...(groups ?? [])].sort((a, b) => {
    if (a.id === currentGroupId) return -1
    if (b.id === currentGroupId) return 1
    if (a.id === last) return -1
    if (b.id === last) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <details className="relative min-w-0 max-w-[min(16rem,60vw)]" data-testid="group-switcher"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.currentTarget.open = false
          event.currentTarget.querySelector('summary')?.focus()
        }
      }} onBlur={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
      }}>
      <summary
        aria-label={`${currentGroupName}: ${t('workspace.switchGroup')}`}
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-sm font-medium text-ink hover:bg-neutral-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary [&::-webkit-details-marker]:hidden"
      >
        <span className="truncate">{currentGroupName}</span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </summary>
      <ul className="absolute left-0 z-50 md:left-auto md:right-0 mt-1 max-h-72 w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border-subtle bg-surface p-1 text-ink shadow-lg">
        {ordered.map((group) => (
          <li key={group.id}>
            <button
              type="button"
              aria-current={group.id === currentGroupId ? 'page' : undefined}
              onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); navigate(routes.group(group.id)) }}
              className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-ink hover:bg-neutral-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              <span className="truncate">{group.name}</span>
            </button>
          </li>
        ))}
        <li className="border-t border-border-subtle"><button type="button" onClick={() => navigate(routes.groups)}
          className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-primary-ink hover:bg-surface-hover">{t('workspace.myGroups')}</button></li>
      </ul>
    </details>
  )
}
