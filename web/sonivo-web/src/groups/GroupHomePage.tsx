import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CalendarDays, CheckSquare, Library, ListMusic, Music2, UserPlus } from 'lucide-react'
import {
  ApiError,
  createInvitation,
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
import {
  fieldClass,
  formatMembershipRole,
  isOwnerRole,
  mutationErrorMessage,
  ProblemAlert,
} from '../repertoire/ui'
import { EmptyPanel } from '../repertoire/chrome'
import { Button, primaryButtonClass, secondaryButtonClass } from '../ui/button'
import { cn } from '../ui/cn'
import { useT } from '../i18n'

import { formatEventType, formatStartsAt } from '../scheduling/datetime'

const TILE_CLASS =
  'flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-4 py-3 no-underline transition duration-150 hover:border-primary/25 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none'

const TILE_ICON_CLASS =
  'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-ink'

function pickUpcomingEvent(events: EventListItem[]): EventListItem | null {
  const now = Date.now()
  const upcoming = events
    .filter((event) => event.status === 'scheduled')
    .filter((event) => {
      const t = new Date(event.startsAt).getTime()
      return !Number.isNaN(t) && t >= now
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  if (upcoming[0]) return upcoming[0]

  const scheduled = events
    .filter((event) => event.status === 'scheduled')
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  return scheduled[0] ?? null
}

function formatRelativeUpdated(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat('es', {
      day: 'numeric',
      month: 'short',
    }).format(date)
  } catch {
    return date.toLocaleDateString()
  }
}

function formatRsvpLabel(response: EventRsvpResponse | string | null): string {
  switch (response) {
    case 'yes':
      return 'Sí'
    case 'no':
      return 'No'
    case 'maybe':
      return 'Quizás'
    default:
      return 'Aún no confirmaste tu asistencia'
  }
}

export function GroupHomePage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<EventListItem[] | null>(null)
  const [setlists, setSetlists] = useState<SetlistListItem[] | null>(null)
  const [songCount, setSongCount] = useState<number | null>(null)
  const [recentSongs, setRecentSongs] = useState<SongListItem[] | null>(null)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [myRsvp, setMyRsvp] = useState<EventRsvpResponse | string | null | undefined>(undefined)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteEmailWarning, setInviteEmailWarning] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)
  const { t } = useT()

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!groupId) return
      setGroup(undefined)
      setError(null)
      setInviteUrl(null)
      setInviteError(null)
      setInviteEmail('')
      setInviteEmailWarning(false)
      setCopied(false)
      setEvents(null)
      setSetlists(null)
      setSongCount(null)
      setRecentSongs(null)
      setComposeError(null)
      try {
        const result = await getGroup(groupId)
        if (!cancelled) setGroup(result)
      } catch (err) {
        if (cancelled) return
        setGroup(null)
        if (err instanceof ApiError && err.status === 404) {
          setError(t('inicio.notFound'))
        } else {
          setError(problemDetail(err))
        }
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
        setSongCount(songs.length)
        setRecentSongs(songs)
      } catch (err) {
        if (cancelled) return
        setEvents([])
        setSetlists([])
        setSongCount(0)
        setComposeError(mutationErrorMessage(err))
      }
    }
    void loadCompose()
    return () => {
      cancelled = true
    }
  }, [groupId, group])

  const isOwner = isOwnerRole(group?.role)

  const nextEvent = useMemo(() => (events ? pickUpcomingEvent(events) : null), [events])
  const latestSongs = useMemo(
    () =>
      recentSongs
        ? [...recentSongs]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 4)
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
        const mine = list.items.find((item) => item.userId === user.id)
        setMyRsvp(mine?.response ?? null)
      } catch {
        if (!cancelled) setMyRsvp(null)
      }
    }
    void loadRsvp()
    return () => {
      cancelled = true
    }
  }, [groupId, nextEvent, user.id])

  async function onInviteMember() {
    if (!group) return
    setInviting(true)
    setInviteError(null)
    setInviteEmailWarning(false)
    setCopied(false)
    try {
      const created = await createInvitation(group.id, inviteEmail)
      setInviteUrl(`${window.location.origin}/join/${created.token}`)
      if (inviteEmail.trim() && !created.emailed) {
        setInviteEmailWarning(true)
      }
    } catch (err) {
      setInviteError(mutationErrorMessage(err))
    } finally {
      setInviting(false)
    }
  }

  async function onCopyInviteLink() {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (group === undefined) {
    return <p aria-live="polite">{t('inicio.loading')}</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-error-ink">
          {error}
        </p>
        <Link className="font-semibold text-primary-ink no-underline hover:underline" to="/">
          {t('inicio.myGroups')}
        </Link>
      </div>
    )
  }

  return (
    <section className="space-y-8" aria-label={group.name}>
      <div className="space-y-2">
        <h1 className="sr-only">{group.name}</h1>
        <p className="text-sm text-muted">{t('inicio.summary')}</p>
        <p className="text-sm text-muted">
          {t('inicio.rolePrefix')}<strong>{formatMembershipRole(group.role)}</strong>.
        </p>
      </div>

      <ProblemAlert message={composeError} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to={`/groups/${group.id}/library`} data-testid="home-stat-songs" className={TILE_CLASS}>
          <span className={TILE_ICON_CLASS} aria-hidden="true">
            <Music2 className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{t('inicio.tileSongs')}</span>
            <span className="block truncate text-xs text-muted">{t('inicio.tileSongsDesc')}</span>
          </span>
        </Link>
        <Link to={`/groups/${group.id}/events`} data-testid="home-stat-events" className={TILE_CLASS}>
          <span className={TILE_ICON_CLASS} aria-hidden="true">
            <CalendarDays className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{t('inicio.tileCalendar')}</span>
            <span className="block truncate text-xs text-muted">{t('inicio.tileCalendarDesc')}</span>
          </span>
        </Link>
        <Link to={`/groups/${group.id}/recursos`} className={TILE_CLASS}>
          <span className={TILE_ICON_CLASS} aria-hidden="true">
            <Library className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{t('inicio.tileResources')}</span>
            <span className="block truncate text-xs text-muted">{t('inicio.tileResourcesDesc')}</span>
          </span>
        </Link>
        <Link to={`/groups/${group.id}/tasks`} className={TILE_CLASS}>
          <span className={TILE_ICON_CLASS} aria-hidden="true">
            <CheckSquare className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{t('inicio.tileTasks')}</span>
            <span className="block truncate text-xs text-muted">{t('inicio.tileTasksDesc')}</span>
          </span>
        </Link>
      </div>

      {/* Quick actions */}
      <section className="space-y-3" aria-labelledby="quick-actions-heading">
        <h3 id="quick-actions-heading" className="font-semibold">
          {t('inicio.quickActions')}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            to={`/groups/${group.id}/library?new=1`}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-sm font-medium text-ink no-underline transition duration-150 hover:border-primary/25 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
          >
            <Music2 className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
            {t('inicio.quickAddSong')}
          </Link>
          <Link
            to={`/groups/${group.id}/setlists?new=1`}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-sm font-medium text-ink no-underline transition duration-150 hover:border-primary/25 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
          >
            <ListMusic className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
            {t('inicio.quickCreateList')}
          </Link>
          <Link
            to={`/groups/${group.id}/events?new=1`}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-sm font-medium text-ink no-underline transition duration-150 hover:border-primary/25 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
            {t('inicio.quickCreateEvent')}
          </Link>
          <Link
            to={`/groups/${group.id}/tasks?new=1`}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-sm font-medium text-ink no-underline transition duration-150 hover:border-primary/25 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
          >
            <CheckSquare className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
            {t('inicio.quickCreateTask')}
          </Link>
          <Link
            to={`/groups/${group.id}/recursos?new=1`}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-sm font-medium text-ink no-underline transition duration-150 hover:border-primary/25 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
          >
            <Library className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
            {t('inicio.quickAddResource')}
          </Link>
          {isOwner ? (
            <button
              type="button"
              onClick={() => {
                setInviteEmail('')
                setInviteUrl(null)
                setInviteError(null)
                setInviteEmailWarning(false)
                setCopied(false)
                setInviting(false)
              }}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-sm font-medium text-ink transition duration-150 hover:border-primary/25 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
            >
              <UserPlus className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
              {t('inicio.quickInviteMember')}
            </button>
          ) : null}
        </div>
      </section>

      {isOwner && setlists?.length === 0 && events?.length === 0 && songCount === 0 ? (
        <section
          className="rounded-2xl border border-primary/25 bg-primary/5 p-5"
          aria-labelledby="home-start-heading"
          data-testid="home-get-started"
        >
          <h3 id="home-start-heading" className="font-semibold text-ink">
            {t('inicio.getStartedTitle')}
          </h3>
          <p className="mt-1 text-sm text-muted">{t('inicio.getStartedIntro')}</p>
          <ol className="mt-3 space-y-1.5">
            <li>
              <Link
                to={`/groups/${group.id}/library`}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary-ink no-underline hover:underline"
              >
                <Music2 className="h-4 w-4" aria-hidden="true" />
                {t('inicio.getStartedSongs')}
              </Link>
            </li>
            <li>
              <Link
                to={`/groups/${group.id}/setlists`}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary-ink no-underline hover:underline"
              >
                <ListMusic className="h-4 w-4" aria-hidden="true" />
                {t('inicio.getStartedSetlists')}
              </Link>
            </li>
            <li>
              <Link
                to={`/groups/${group.id}/events`}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary-ink no-underline hover:underline"
              >
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {t('inicio.getStartedEvents')}
              </Link>
            </li>
          </ol>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3" aria-labelledby="next-event-heading">
          <h3 id="next-event-heading" className="font-semibold">
            {t('inicio.nextEvent')}
          </h3>
          {events === null ? (
            <p aria-live="polite" className="text-sm text-muted">
              {t('inicio.loadingEvents')}
            </p>
          ) : nextEvent ? (
            <div
              className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-3"
              data-testid="home-next-event"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary-ink"
                  aria-hidden="true"
                >
                  <CalendarDays className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate font-semibold text-ink">{nextEvent.title}</p>
                  <p className="text-sm text-muted">{formatStartsAt(nextEvent.startsAt)}</p>
                  <p className="text-xs text-muted">{formatEventType(nextEvent.type)}</p>
                </div>
              </div>
              <p className="text-sm text-muted" data-testid="home-next-event-rsvp">
                {t('inicio.myRsvp')}{' '}
                <strong>
                  {myRsvp === undefined ? '…' : formatRsvpLabel(myRsvp)}
                </strong>
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  className={cn(primaryButtonClass, 'min-h-11 no-underline')}
                  to={`/groups/${group.id}/events/${nextEvent.id}`}
                  data-testid="home-next-event-plan"
                >
                  {t('inicio.viewPlan')}
                </Link>
                <Link
                  className={cn(secondaryButtonClass, 'min-h-11 no-underline')}
                  to={`/groups/${group.id}/events/${nextEvent.id}`}
                >
                  {t('inicio.confirmRsvp')}
                </Link>
              </div>
            </div>
          ) : (
            <EmptyPanel
              title={t('inicio.noEventsTitle')}
              description={
                isOwner ? t('inicio.noEventsOwner') : t('inicio.noEventsMember')
              }
              action={
                <Link
                  className="font-semibold text-primary-ink no-underline hover:underline"
                  to={`/groups/${group.id}/events`}
                  data-testid="home-empty-events"
                >
                  {t('inicio.goEvents')}
                </Link>
              }
            />
          )}
        </section>

        <section className="space-y-3" aria-labelledby="recent-songs-heading">
          <div className="flex items-center justify-between gap-3">
            <h3 id="recent-songs-heading" className="font-semibold">
              {t('inicio.recentSongs')}
            </h3>
            <Link
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary-ink no-underline hover:underline"
              to={`/groups/${group.id}/library`}
            >
              {t('inicio.viewAll')}
            </Link>
          </div>
          {latestSongs === null ? (
            <p aria-live="polite" className="text-sm text-muted">
              {t('inicio.loadingSongs')}
            </p>
          ) : latestSongs.length === 0 ? (
            <EmptyPanel
              title={t('inicio.noSongsTitle')}
              description={isOwner ? t('inicio.noSongsOwner') : t('inicio.noSongsMember')}
              action={
                <Link
                  className="font-semibold text-primary-ink no-underline hover:underline"
                  to={`/groups/${group.id}/library`}
                >
                  {t('inicio.goSongs')}
                </Link>
              }
            />
          ) : (
            <ul className="space-y-1.5">
              {latestSongs.map((song, index) => (
                <li key={song.id}>
                  <Link
                    className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-3 py-2.5 no-underline transition duration-150 hover:border-primary/25 hover:bg-surface-hover"
                    to={`/groups/${group.id}/songs/${song.id}`}
                    style={{ animationDelay: `${Math.min(index, 4) * 40}ms` }}
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/20 text-ink"
                      aria-hidden="true"
                    >
                      <Music2 className="h-5 w-5" />
                    </span>
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
        </section>
      </div>

      <div
        className="overflow-hidden rounded-2xl px-5 py-6 text-white"
        style={{ backgroundImage: 'linear-gradient(135deg, var(--brand-primary, #8366f1), #2b1a5e)' }}
      >
        <p className="max-w-xl text-lg font-semibold leading-snug">{t('inicio.promoTitle')}</p>
        <p className="mt-1 text-sm text-white/80">— {group.name}</p>
      </div>

      {isOwner ? (
        <section className="space-y-6 border-t border-border-subtle pt-6" aria-labelledby="admin-heading">
          <h2 id="admin-heading" className="text-lg font-semibold">
            {t('inicio.admin')}
          </h2>

          <div className="space-y-3">
            <h3 className="font-medium">{t('inicio.inviteTitle')}</h3>
            <label className="block max-w-md space-y-1.5">
              <span className="text-sm font-medium text-ink">
                {t('inicio.inviteEmail')}
              </span>
              <input
                className={fieldClass}
                type="email"
                autoComplete="off"
                aria-label={t('inicio.inviteEmail')}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </label>
            <Button disabled={inviting} onClick={() => void onInviteMember()}>
              {inviting ? t('inicio.working') : t('inicio.invite')}
            </Button>
            <ProblemAlert message={inviteError} />
            {inviteEmailWarning ? (
              <p
                role="status"
                className="rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-ink"
              >
                {t('inicio.inviteMailWarning')}
              </p>
            ) : null}
            {inviteUrl ? (
              <div className="max-w-md space-y-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-ink">{t('inicio.inviteLinkLabel')}</span>
                  <input
                    className={fieldClass}
                    readOnly
                    aria-label={t('inicio.inviteLinkLabel')}
                    value={inviteUrl}
                  />
                </label>
                <Button variant="secondary" onClick={() => void onCopyInviteLink()}>
                  {t('inicio.copyLink')}
                </Button>
                {copied ? (
                  <p aria-live="polite" className="text-sm text-muted">
                    {t('inicio.copied')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </section>
  )
}
