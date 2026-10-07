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
  Zap,
} from 'lucide-react'
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
import { fieldClass, formatMembershipRole, isOwnerRole, mutationErrorMessage, ProblemAlert } from '../repertoire/ui'
import { useT } from '../i18n'
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
  GroupCard,
  GroupEmptyState,
  GroupErrorState,
  GroupIconWell,
  GroupLink,
  GroupListSkeleton,
  GroupPageSkeleton,
  GroupSection,
  useGroupDataSignal,
} from './ui'

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
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteEmailWarning, setInviteEmailWarning] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [dialog, setDialog] = useState<HomeDialog | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
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
      setRecentSongs(null)
      setComposeError(null)
      try {
        const result = await getGroup(groupId)
        if (!cancelled) setGroup(result)
      } catch (err) {
        if (cancelled) return
        setGroup(null)
        setError(err instanceof ApiError && err.status === 404 ? t('inicio.notFound') : problemDetail(err))
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

  useGroupDataSignal(['songs', 'setlists', 'events'], groupId, () => setReloadKey((key) => key + 1))

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

  function resetInvite() {
    setInviteEmail('')
    setInviteUrl(null)
    setInviteError(null)
    setInviteEmailWarning(false)
    setCopied(false)
    setInviting(false)
  }

  async function onInviteMember() {
    if (!group) return
    setInviting(true)
    setInviteError(null)
    setInviteEmailWarning(false)
    setCopied(false)
    try {
      const created = await createInvitation(group.id, inviteEmail)
      setInviteUrl(`${window.location.origin}/join/${created.token}`)
      if (inviteEmail.trim() && !created.emailed) setInviteEmailWarning(true)
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
    return <GroupPageSkeleton label={t('inicio.loading')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState message={error} />
        <GroupLink variant="soft" to="/">
          {t('inicio.myGroups')}
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
            {formatMembershipRole(group.role)}
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

      {/* Quick actions */}
      <GroupSection
        title={t('inicio.quickActions')}
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
            <button
              type="button"
              onClick={resetInvite}
              className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-4 py-3 text-left transition duration-150 hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
            >
              <GroupIconWell icon={UserPlus} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{t('home.quickAddMember')}</span>
                <span className="block truncate text-xs text-muted">{t('home.quickAddMemberHint')}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </GroupSection>

      {/* Upcoming events */}
      <GroupSection
        title={t('inicio.nextEvent')}
        headingId="upcoming-events-heading"
        action={
          <GroupLink variant="ghost" size="sm" to={`/groups/${group.id}/events`}>
            {t('inicio.viewAll')}
          </GroupLink>
        }
      >
        {upcoming === null ? (
          <GroupListSkeleton rows={3} label={t('inicio.loadingEvents')} />
        ) : upcoming.length === 0 ? (
          <GroupEmptyState
            icon={CalendarDays}
            title={t('inicio.noEventsTitle')}
            description={isOwner ? t('inicio.noEventsOwner') : t('inicio.noEventsMember')}
            action={
              <GroupLink variant="soft" to={`/groups/${group.id}/events`} data-testid="home-empty-events">
                {t('inicio.goEvents')}
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
                        {formatEventType(event.type)} · {formatStartsAt(event.startsAt)}
                      </span>
                    </span>
                    {index === 0 ? (
                      <span className="hidden text-sm text-muted sm:block" data-testid="home-next-event-rsvp">
                        {t('inicio.myRsvp')} {myRsvp === undefined ? '…' : formatRsvpLabel(myRsvp)}
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
        title={t('inicio.recentSongs')}
        headingId="recent-songs-heading"
        action={
          <GroupLink variant="ghost" size="sm" to={`/groups/${group.id}/library`}>
            {t('inicio.viewAll')}
          </GroupLink>
        }
      >
        {latestSongs === null ? (
          <GroupListSkeleton rows={2} label={t('inicio.loadingSongs')} />
        ) : latestSongs.length === 0 ? (
          <GroupEmptyState
            icon={Music2}
            title={t('inicio.noSongsTitle')}
            description={isOwner ? t('inicio.noSongsOwner') : t('inicio.noSongsMember')}
            action={
              <GroupLink variant="soft" to={`/groups/${group.id}/library`}>
                {t('inicio.goSongs')}
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

      {isOwner ? (
        <GroupSection
          title={t('inicio.admin')}
          headingId="admin-heading"
          className="border-t border-border-subtle pt-6"
        >
          <GroupCard className="max-w-xl space-y-3">
            <h3 className="font-medium">{t('inicio.inviteTitle')}</h3>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t('inicio.inviteEmail')}</span>
              <input
                className={fieldClass}
                type="email"
                autoComplete="off"
                aria-label={t('inicio.inviteEmail')}
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
            </label>
            <GroupButton disabled={inviting} onClick={() => void onInviteMember()}>
              {inviting ? t('inicio.working') : t('inicio.invite')}
            </GroupButton>
            <ProblemAlert message={inviteError} />
            {inviteEmailWarning ? (
              <p role="status" className="rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-ink">
                {t('inicio.inviteMailWarning')}
              </p>
            ) : null}
            {inviteUrl ? (
              <div className="space-y-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-ink">{t('inicio.inviteLinkLabel')}</span>
                  <input className={fieldClass} readOnly aria-label={t('inicio.inviteLinkLabel')} value={inviteUrl} />
                </label>
                <GroupButton variant="secondary" onClick={() => void onCopyInviteLink()}>
                  {t('inicio.copyLink')}
                </GroupButton>
                {copied ? (
                  <p aria-live="polite" className="text-sm text-muted">
                    {t('inicio.copied')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </GroupCard>
        </GroupSection>
      ) : null}

      {/* Gathering state for existing members */}
      {setlists?.length === 0 && events?.length === 0 && (recentSongs?.length ?? 0) === 0 && isOwner ? (
        <p className="sr-only">{t('inicio.getStartedTitle')}</p>
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
