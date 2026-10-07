import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Bell, CalendarDays, CheckSquare, Music2, Search } from 'lucide-react'
import {
  listEvents,
  listSongs,
  listTasks,
  type CurrentUser,
  type EventListItem,
  type SongListItem,
  type TaskItem,
} from '../api/client'
import { useT, type I18nKey } from '../i18n'
import { cn } from '../ui/cn'
import { formatMembershipRole } from '../repertoire/ui'

type SearchHit = { id: string; label: string; hint: I18nKey; to: string; kind: 'song' | 'event' | 'task' }

/**
 * Desktop top bar for the group shell (owner reference 2026-10-07): a
 * group-scoped search over songs/events/tasks, plus a notifications entry and
 * the account avatar. Replaces nothing on mobile (the compact header stays).
 */
export function GroupTopBar({
  groupId,
  user,
  role,
  onLogout,
}: {
  groupId: string
  user: CurrentUser
  role: string
  onLogout: () => void
}) {
  const { t } = useT()
  const navigate = useNavigate()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [songs, setSongs] = useState<SongListItem[]>([])
  const [events, setEvents] = useState<EventListItem[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])

  useEffect(() => {
    let cancelled = false
    void Promise.all([listSongs(groupId), listEvents(groupId), listTasks(groupId)])
      .then(([songItems, eventItems, taskItems]) => {
        if (cancelled) return
        setSongs(songItems)
        setEvents(eventItems)
        setTasks(taskItems)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [groupId])

  useEffect(() => {
    if (!open) return
    function onDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const songHits: SearchHit[] = songs
      .filter((song) => song.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map((song) => ({ id: `s-${song.id}`, label: song.title, hint: 'topbar.kindSong' as const, to: `/groups/${groupId}/songs/${song.id}`, kind: 'song' as const }))
    const eventHits: SearchHit[] = events
      .filter((event) => event.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map((event) => ({ id: `e-${event.id}`, label: event.title, hint: 'topbar.kindEvent' as const, to: `/groups/${groupId}/events/${event.id}`, kind: 'event' as const }))
    const taskHits: SearchHit[] = tasks
      .filter((task) => task.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map((task) => ({ id: `t-${task.id}`, label: task.title, hint: 'topbar.kindTask' as const, to: `/groups/${groupId}/tasks`, kind: 'task' as const }))
    return [...songHits, ...eventHits, ...taskHits].slice(0, 8)
  }, [query, songs, events, tasks, groupId])

  const showPanel = open && query.trim().length > 0

  function choose(hit: SearchHit) {
    setOpen(false)
    setQuery('')
    navigate(hit.to)
  }

  const Icon = { song: Music2, event: CalendarDays, task: CheckSquare }

  return (
    <header className="hidden items-center gap-3 px-4 py-3 md:flex" data-testid="group-topbar">
      <div ref={wrapRef} className="relative mx-auto w-full max-w-2xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="group-search-results"
          aria-autocomplete="list"
          aria-label={t('app.searchLabel')}
          autoComplete="off"
          data-testid="group-search"
          className="h-11 w-full rounded-full border border-border-subtle bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          placeholder={t('topbar.searchPlaceholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((index) => Math.min(index + 1, hits.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((index) => Math.max(index - 1, 0))
            } else if (event.key === 'Enter' && hits[active]) {
              event.preventDefault()
              choose(hits[active])
            }
          }}
        />
        {showPanel ? (
          <div
            id="group-search-results"
            role="listbox"
            aria-label={t('app.searchLabel')}
            className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border-subtle bg-surface p-1 shadow-xl"
          >
            {hits.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">{t('app.searchNoResults')}</p>
            ) : (
              hits.map((hit, index) => {
                const HitIcon = Icon[hit.kind]
                return (
                  <button
                    key={hit.id}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(hit)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink',
                      index === active ? 'bg-surface-hover' : 'hover:bg-surface-hover',
                    )}
                  >
                    <HitIcon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{hit.label}</span>
                    <span className="shrink-0 text-xs text-muted">{t(hit.hint)}</span>
                  </button>
                )
              })
            )}
          </div>
        ) : null}
      </div>

      <Link
        to="/cuenta/notificaciones"
        aria-label={t('workspace.account')}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface text-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
      </Link>

      <details className="relative shrink-0" data-testid="topbar-user-menu">
        <summary
          aria-label={user.displayName ?? t('workspace.account')}
          className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full bg-primary-strong text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"
        >
          {(user.displayName ?? '').trim().slice(0, 1).toUpperCase()}
        </summary>
        <nav
          aria-label={t('workspace.account')}
          className="absolute right-0 top-full z-50 mt-1 w-56 space-y-0.5 rounded-xl border border-border-subtle bg-surface p-1 text-ink shadow-lg"
        >
          <p className="px-3 py-2 text-xs text-muted">{formatMembershipRole(role, t)}</p>
          <Link to="/grupos" className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-ink no-underline hover:bg-neutral-light">
            {t('workspace.myGroups')}
          </Link>
          <Link to="/cuenta" className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-ink no-underline hover:bg-neutral-light">
            {t('workspace.account')}
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="flex min-h-11 w-full items-center rounded-lg px-3 text-sm font-medium text-error-ink transition-colors hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t('workspace.logout')}
          </button>
        </nav>
      </details>
    </header>
  )
}
