import { routes } from '../routing/routes'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AppLink } from '../routing/AppLink'
import { Bell, CalendarDays, CheckSquare, CircleHelp, LogOut, Music2, Search, UserRound, Users, X } from 'lucide-react'
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
import { NotificationBell } from '../notifications/NotificationBell'
import { ShellHeaderBrand } from './ShellHeaderBrand'
import { MobileSectionNav, type MobileSectionItem } from './MobileSectionNav'
import { MobileMoreMenu } from './MobileMoreMenu'
import { FocusBackdrop } from './FocusBackdrop'

type SearchHit = { id: string; label: string; hint: I18nKey; to: string; kind: 'song' | 'event' | 'task' }

/**
 * Responsive group header: stable brand, focused search, and account actions.
 * Mobile search replaces the quick navigation row while it is active.
 */
export function GroupTopBar({
  groupId,
  user,
  role,
  onLogout,
  navigate,
  brand,
  pinned,
  onToggleSidebar,
  mobileItems,
  moreItems,
}: {
  groupId: string
  user: CurrentUser
  role: string
  onLogout: () => void
  navigate: (to: string) => void
  brand: ReactNode
  pinned: boolean
  onToggleSidebar: () => void
  mobileItems: MobileSectionItem[]
  moreItems: MobileSectionItem[]
}) {
  const { t } = useT()
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchToggleRef = useRef<HTMLButtonElement>(null)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [songs, setSongs] = useState<SongListItem[]>([])
  const [events, setEvents] = useState<EventListItem[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])

  useEffect(() => {
    if (mobileSearchOpen) inputRef.current?.focus()
  }, [mobileSearchOpen])

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
      .map((song) => ({ id: `s-${song.id}`, label: song.title, hint: 'topbar.kindSong' as const, to: routes.groupSong(groupId, song.id), kind: 'song' as const }))
    const eventHits: SearchHit[] = events
      .filter((event) => event.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map((event) => ({ id: `e-${event.id}`, label: event.title, hint: 'topbar.kindEvent' as const, to: routes.groupEvent(groupId, event.id), kind: 'event' as const }))
    const taskHits: SearchHit[] = tasks
      .filter((task) => task.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map((task) => ({ id: `t-${task.id}`, label: task.title, hint: 'topbar.kindTask' as const, to: routes.groupTasks(groupId), kind: 'task' as const }))
    return [...songHits, ...eventHits, ...taskHits].slice(0, 8)
  }, [query, songs, events, tasks, groupId])

  const showPanel = open && query.trim().length > 0

  function choose(hit: SearchHit) {
    setOpen(false)
    setMobileSearchOpen(false)
    setQuery('')
    navigate(hit.to)
  }

  const Icon = { song: Music2, event: CalendarDays, task: CheckSquare }

  return (
    <header className={cn('group-shell-header relative grid shrink-0 grid-cols-[minmax(0,1fr)_auto] bg-shell md:grid-cols-[15rem_minmax(0,1fr)_auto]', open || notificationsOpen ? 'z-[60]' : 'z-40')} data-testid="group-topbar">
      {open ? <FocusBackdrop testId="search-backdrop" onDismiss={() => {
        setOpen(false)
        setMobileSearchOpen(false)
        inputRef.current?.blur()
        if (mobileSearchOpen) searchToggleRef.current?.focus()
      }} /> : null}
      <ShellHeaderBrand group pinned={pinned} onToggle={onToggleSidebar}>
        {brand}
      </ShellHeaderBrand>
      <div ref={wrapRef} id="group-search-field"
        className={cn('relative z-20 col-span-2 min-w-0 px-4 pb-3 pt-1 md:col-span-1 md:col-start-2 md:row-start-1 md:self-center md:py-0', mobileSearchOpen ? 'block' : 'hidden md:block')}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== searchToggleRef.current) {
            setOpen(false)
            setMobileSearchOpen(false)
          }
        }}
      >
        <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
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
              inputRef.current?.blur()
              if (mobileSearchOpen) searchToggleRef.current?.focus()
              setMobileSearchOpen(false)
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

      </div>
      <div className="relative z-30 col-start-2 row-start-1 flex h-16 items-center gap-1 pr-3 md:col-start-3 md:gap-3 md:pr-4">
      <button
        ref={searchToggleRef}
        type="button"
        aria-label={t(mobileSearchOpen ? 'app.closeSearch' : 'app.searchLabel')}
        aria-expanded={mobileSearchOpen}
        aria-controls="group-search-field"
        data-testid="group-mobile-search-toggle"
        onClick={() => { setMobileSearchOpen((value) => !value); setOpen(false) }}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-shell-foreground/80 hover:bg-shell-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary md:hidden"
      >
        {mobileSearchOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Search className="h-5 w-5" aria-hidden="true" />}
      </button>
      <AppLink to={routes.groupCalendar(groupId)} aria-label={t('calendar.title')} data-testid="group-calendar" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-shell-foreground/80 no-underline hover:bg-shell-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
        <CalendarDays className="h-5 w-5" aria-hidden="true" />
      </AppLink>
      <NotificationBell scope="group" groupId={groupId} onOpenChange={setNotificationsOpen} />

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
          <AppLink to={routes.groups} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink no-underline hover:bg-surface-hover focus-visible:bg-surface-hover">
            <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('workspace.myGroups')}
          </AppLink>
          <AppLink
            to={routes.accountNotifications}
            className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink no-underline hover:bg-surface-hover focus-visible:bg-surface-hover"
          >
            <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('notifications.accountTitle')}
          </AppLink>
          <AppLink to={routes.account} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink no-underline hover:bg-surface-hover focus-visible:bg-surface-hover">
            <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('workspace.account')}
          </AppLink>
          <AppLink to={routes.help} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink no-underline hover:bg-surface-hover focus-visible:bg-surface-hover">
            <CircleHelp className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('sidebar.help')}
          </AppLink>
          <button
            type="button"
            onClick={onLogout}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-error-ink transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('workspace.logout')}
          </button>
        </nav>
      </details>
      </div>
      {!mobileSearchOpen ? (
        <MobileSectionNav items={mobileItems} label={t('workspace.groupNav')} className="col-span-2 md:hidden" action={<MobileMoreMenu items={moreItems} />} />
      ) : null}
    </header>
  )
}
