import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CalendarDays,
  CheckSquare,
  ChevronRight,
  Library,
  ListMusic,
  Music2,
  Play,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react'
import {
  ApiError,
  getGroup,
  listEventRsvps,
  listEvents,
  listSetlists,
  listSongs,
  problemDetail,
  type CurrentUser,
  type EventListItem,
  type EventRsvpResponse,
  type GroupDetail,
  type SetlistListItem,
  type SongListItem,
} from '../api/client'
import { formatMembershipRole, isOwnerRole, mutationErrorMessage } from '../repertoire/ui'
import { useT, type I18nKey } from '../i18n'
import { formatEventType, formatStartsAt } from '../scheduling/datetime'
import {
  CreateEventDialog,
  CreateResourceDialog,
  CreateSetlistDialog,
  CreateSongDialog,
  CreateTaskDialog,
} from './dialogs'
import {
  GroupButton,
  GroupEmptyState,
  GroupErrorState,
  GroupIconWell,
  GroupLink,
  GroupListSkeleton,
  GroupPageSkeleton,
  GroupSection,
  GroupStat,
  useGroupDataSignal,
} from './ui'
import { useGroupUsage } from './useGroupUsage'

type HomeDialog = 'song' | 'setlist' | 'event' | 'task' | 'resource'

function pickUpcoming(events: EventListItem[]): EventListItem[] {
  const now = Date.now()
  return events
    .filter((event) => event.status === 'scheduled')
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .filter((event) => new Date(event.startsAt).getTime() >= now - 12 * 3600_000)
    .slice(0, 4)
}

function formatRelativeUpdated(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(date)
  } catch {
    return date.toLocaleDateString()
  }
}

function formatRsvpLabel(
  response: EventRsvpResponse | string | null,
  t: (key: I18nKey) => string,
): string {
  switch (response) {
    case 'yes':
      return t('event.rsvpYes')
    case 'no':
      return t('event.rsvpNo')
    case 'maybe':
      return t('event.rsvpMaybe')
    default:
      return t('event.rsvpPending')
  }
}

function eventDateParts(iso: string): { weekday: string; day: string; month: string } {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { weekday: '', day: '', month: '' }
  const weekday = new Intl.DateTimeFormat('es', { weekday: 'short' }).format(date).slice(0, 3)
  const month = new Intl.DateTimeFormat('es', { month: 'short' }).format(date).slice(0, 3)
  return { weekday, day: String(date.getDate()), month }
}

export function GroupHomePage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<EventListItem[] | null>(null)
  const [setlists, setSetlists] = useState<SetlistListItem[] | null>(null)
  const [recentSongs, setRecentSongs] = useState<SongListItem[] | null>(null)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [myRsvp, setMyRsvp] = useState<EventRsvpResponse | string | null | undefined>(undefined)
  const [dialog, setDialog] = useState<HomeDialog | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const { t } = useT()
  const { usage, reload: reloadUsage } = useGroupUsage(groupId)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!groupId) return
      setGroup(undefined)
      setError(null)
      setEvents(null)
      setSetlists(null)
      setRecentSongs(null)
      setComposeError(null)
      try {
        const result = await getGroup(groupId)
        if (!cancelled) setGroup(result)
      } catch (err) {
        if (cancelled) return
        setGroup(null)
        setError(err instanceof ApiError && err.status === 404 ? t('dashboard.notFound') : problemDetail(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, user.id])

  useEffect(() => {
    if (!groupId || !group) return
    let cancelled = false
    async function loadCompose() {
      setComposeError(null)
      try {
        const [eventItems, setlistItems, songs] = await Promise.all([
          listEvents(groupId!),
          listSetlists(groupId!),
          listSongs(groupId!),
        ])
        if (cancelled) return
        setEvents(eventItems)
        setSetlists(setlistItems)
        setRecentSongs(songs)
      } catch (err) {
        if (cancelled) return
        setEvents([])
        setSetlists([])
        setRecentSongs([])
        setComposeError(mutationErrorMessage(err))
      }
    }
    void loadCompose()
    return () => {
      cancelled = true
    }
  }, [groupId, group, reloadKey])

  useGroupDataSignal(['songs', 'setlists', 'events'], groupId, () => {
    setReloadKey((key) => key + 1)
    void reloadUsage()
  })

  const isOwner = isOwnerRole(group?.role)
  const upcoming = useMemo(() => (events ? pickUpcoming(events) : null), [events])
  const nextEvent = upcoming?.[0] ?? null
  const latestSongs = useMemo(
    () =>
      recentSongs
        ? [...recentSongs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 4)
        : null,
    [recentSongs],
  )

  useEffect(() => {
    if (!groupId || !nextEvent || nextEvent.status !== 'scheduled') {
      setMyRsvp(null)
      return
    }
    let cancelled = false
    async function loadRsvp() {
      setMyRsvp(undefined)
      try {
        const list = await listEventRsvps(groupId!, nextEvent!.id)
        if (cancelled) return
        setMyRsvp(list.items.find((item) => item.userId === user.id)?.response ?? null)
      } catch {
        if (!cancelled) setMyRsvp(null)
      }
    }
    void loadRsvp()
    return () => {
      cancelled = true
    }
  }, [groupId, nextEvent, user.id])

  function refresh() {
    setReloadKey((key) => key + 1)
  }

  if (group === undefined) {
    return <GroupPageSkeleton label={t('dashboard.loading')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState message={error} />
        <GroupLink variant="soft" to="/">
          {t('dashboard.myGroups')}
        </GroupLink>
      </div>
    )
  }

  const quickActions: { id: HomeDialog; icon: typeof Music2; title: string; subtitle: string }[] = [
    { id: 'song', icon: Music2, title: t('home.quickAddSong'), subtitle: t('home.quickAddSongHint') },
    { id: 'setlist', icon: ListMusic, title: t('home.quickCreateList'), subtitle: t('home.quickCreateListHint') },
    { id: 'event', icon: CalendarDays, title: t('home.quickCreateEvent'), subtitle: t('home.quickCreateEventHint') },
    { id: 'task', icon: CheckSquare, title: t('home.quickCreateTask'), subtitle: t('home.quickCreateTaskHint') },
    { id: 'resource', icon: Library, title: t('home.quickAddResource'), subtitle: t('home.quickAddResourceHint') },
  ]

  return (
    <section className="space-y-8" aria-label={group.name}>
      {/* Welcome hero (owner reference 2026-10-07) */}
      <div
        className="relative overflow-hidden rounded-2xl px-6 py-7 text-white shadow-sm"
        data-testid="home-hero"
        style={{ backgroundImage: 'linear-gradient(120deg, var(--color-primary) 0%, #1b1035 100%)' }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">{t('home.welcomeTitle')}</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight md:text-4xl">
          {group.name}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-white/85">
          {t('home.welcomeSubtitle')}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <GroupLink
            to={`/groups/${group.id}/library`}
            variant="secondary"
            className="border-0 bg-white/15 text-white hover:bg-white/25"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {t('home.exploreMusic')}
          </GroupLink>
          <span className="hidden text-xs text-white/70 sm:inline">
            {formatMembershipRole(group.role, t)}
          </span>
        </div>
        <div className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 flex-col items-end gap-2 md:flex">
          <span className="flex items-end gap-1" aria-hidden="true">
            {[10, 20, 32, 18, 26].map((height, index) => (
              <span key={index} className="w-1 rounded-full bg-white/40" style={{ height }} />
            ))}
          </span>
        </div>
      </div>

      <GroupErrorState message={composeError} />

      {/* Metrics (home only): live counts from the group usage endpoint. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="home-metrics">
        <GroupStat
          icon={Music2}
          label={t('songs.pageTitle')}
          value={usage?.songs.used ?? '—'}
          to={`/groups/${group.id}/library`}
          testId="home-metric-songs"
        />
        <GroupStat
          icon={ListMusic}
          label={t('nav.setlists')}
          value={usage?.setlists.used ?? '—'}
          to={`/groups/${group.id}/setlists`}
          testId="home-metric-setlists"
        />
        <GroupStat
          icon={CalendarDays}
          label={t('nav.events')}
          value={usage?.eventsThisMonth.used ?? '—'}
          to={`/groups/${group.id}/events`}
          testId="home-metric-events"
        />
        <GroupStat
          icon={Users}
          label={t('nav.people')}
          value={usage?.members.used ?? '—'}
          to={`/groups/${group.id}/people`}
          testId="home-metric-members"
        />
      </div>

      {/* Quick actions */}
      <GroupSection
        title={t('dashboard.quickActions')}
        headingId="quick-actions-heading"
        action={<Zap className="h-4 w-4 text-primary-ink" aria-hidden="true" />}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => setDialog(action.id)}
              className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-4 py-3 text-left transition duration-150 hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
            >
              <GroupIconWell icon={action.icon} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{action.title}</span>
                <span className="block truncate text-xs text-muted">{action.subtitle}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            </button>
          ))}
          {isOwner ? (
            <Link
              to={`/groups/${group.id}/people`}
              className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-4 py-3 no-underline transition duration-150 hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
            >
              <GroupIconWell icon={UserPlus} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{t('home.quickAddMember')}</span>
                <span className="block truncate text-xs text-muted">{t('home.quickAddMemberHint')}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </GroupSection>

      {/* Upcoming events */}
      <GroupSection
        title={t('dashboard.nextEvent')}
        headingId="upcoming-events-heading"
        action={
          <GroupLink variant="ghost" size="sm" to={`/groups/${group.id}/events`}>
            {t('dashboard.viewAll')}
          </GroupLink>
        }
      >
        {upcoming === null ? (
          <GroupListSkeleton rows={3} label={t('dashboard.loadingEvents')} />
        ) : upcoming.length === 0 ? (
          <GroupEmptyState
            icon={CalendarDays}
            title={t('dashboard.noEventsTitle')}
            description={isOwner ? t('dashboard.noEventsOwner') : t('dashboard.noEventsMember')}
            action={
              <GroupLink variant="soft" to={`/groups/${group.id}/events`} data-testid="home-empty-events">
                {t('dashboard.goEvents')}
              </GroupLink>
            }
          />
        ) : (
          <ul className="space-y-2">
            {upcoming.map((event, index) => {
              const parts = eventDateParts(event.startsAt)
              return (
                <li key={event.id}>
                  <Link
                    to={`/groups/${group.id}/events/${event.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-3 py-2.5 no-underline transition duration-150 hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
                    data-testid={index === 0 ? 'home-next-event' : undefined}
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <span
                      className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-ink"
                      aria-hidden="true"
                    >
                      <span className="text-center leading-none">
                        <span className="block text-[10px] font-semibold uppercase">{parts.weekday}</span>
                        <span className="block text-lg font-bold">{parts.day}</span>
                        <span className="block text-[10px] uppercase">{parts.month}</span>
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{event.title}</span>
                      <span className="block truncate text-sm text-muted">
                        {formatEventType(event.type, t)} · {formatStartsAt(event.startsAt)}
                      </span>
                    </span>
                    {index === 0 ? (
                      <span className="hidden text-sm text-muted sm:block" data-testid="home-next-event-rsvp">
                        {t('dashboard.myRsvp')} {myRsvp === undefined ? '…' : formatRsvpLabel(myRsvp, t)}
                      </span>
                    ) : null}
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </GroupSection>

      {/* Recent songs */}
      <GroupSection
        title={t('dashboard.recentSongs')}
        headingId="recent-songs-heading"
        action={
          <GroupLink variant="ghost" size="sm" to={`/groups/${group.id}/library`}>
            {t('dashboard.viewAll')}
          </GroupLink>
        }
      >
        {latestSongs === null ? (
          <GroupListSkeleton rows={2} label={t('dashboard.loadingSongs')} />
        ) : latestSongs.length === 0 ? (
          <GroupEmptyState
            icon={Music2}
            title={t('dashboard.noSongsTitle')}
            description={isOwner ? t('dashboard.noSongsOwner') : t('dashboard.noSongsMember')}
            action={
              <GroupLink variant="soft" to={`/groups/${group.id}/library`}>
                {t('dashboard.goSongs')}
              </GroupLink>
            }
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {latestSongs.map((song) => (
              <li key={song.id}>
                <Link
                  to={`/groups/${group.id}/songs/${song.id}`}
                  className="flex min-h-16 items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-3 py-2.5 no-underline transition duration-150 hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
                >
                  <GroupIconWell icon={Music2} tone="success" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{song.title}</span>
                    <span className="mt-0.5 block truncate text-sm text-muted">
                      {song.attribution ? `${song.attribution} · ` : ''}
                      {formatRelativeUpdated(song.updatedAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </GroupSection>

      {/* Gathering state for existing members */}
      {setlists?.length === 0 && events?.length === 0 && (recentSongs?.length ?? 0) === 0 && isOwner ? (
        <p className="sr-only">{t('dashboard.getStartedTitle')}</p>
      ) : null}

      {dialog === 'song' ? (
        <CreateSongDialog
          groupId={group.id}
          onClose={() => setDialog(null)}
          onCreated={() => {
            setDialog(null)
            refresh()
          }}
        />
      ) : null}
      {dialog === 'setlist' ? (
        <CreateSetlistDialog
          groupId={group.id}
          onClose={() => setDialog(null)}
          onCreated={() => {
            setDialog(null)
            refresh()
          }}
        />
      ) : null}
      {dialog === 'event' ? (
        <CreateEventDialog
          groupId={group.id}
          onClose={() => setDialog(null)}
          onCreated={() => {
            setDialog(null)
            refresh()
          }}
        />
      ) : null}
      {dialog === 'task' ? (
        <CreateTaskDialog
          groupId={group.id}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            refresh()
          }}
        />
      ) : null}
      {dialog === 'resource' ? (
        <CreateResourceDialog
          groupId={group.id}
          onClose={() => setDialog(null)}
          onUploaded={() => {
            setDialog(null)
            refresh()
          }}
        />
      ) : null}
    </section>
  )
}
