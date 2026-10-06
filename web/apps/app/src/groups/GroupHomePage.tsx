import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
  formatMembershipRole,
  isOwnerRole,
  mutationErrorMessage,
} from '../repertoire/ui'
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
  GroupInput,
  GroupLink,
  GroupListSkeleton,
  GroupPageHeader,
  GroupPageSkeleton,
  GroupSection,
  GroupStat,
  useGroupDataSignal,
} from './ui'

type HomeDialog = 'song' | 'setlist' | 'event' | 'task' | 'resource'

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
  const navigate = useNavigate()
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
  }, [groupId, group, reloadKey])

  // Refresh the dashboard when songs/setlists/events change here or in another tab.
  useGroupDataSignal(['songs', 'setlists', 'events'], groupId, () => {
    setReloadKey((key) => key + 1)
  })

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

  return (
    <section className="space-y-8" aria-label={group.name}>
      <GroupPageHeader
        headingId="home-heading"
        icon={Music2}
        title={group.name}
        subtitle={t('inicio.summary')}
      >
        <p className="text-sm text-muted">
          {t('inicio.rolePrefix')}
          <strong>{formatMembershipRole(group.role)}</strong>.
        </p>
      </GroupPageHeader>

      <GroupErrorState message={composeError} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <GroupStat
          icon={Music2}
          label={t('inicio.tileSongs')}
          description={t('inicio.tileSongsDesc')}
          to={`/groups/${group.id}/library`}
          testId="home-stat-songs"
        />
        <GroupStat
          icon={CalendarDays}
          label={t('inicio.tileCalendar')}
          description={t('inicio.tileCalendarDesc')}
          to={`/groups/${group.id}/events`}
          testId="home-stat-events"
        />
        <GroupStat
          icon={Library}
          label={t('inicio.tileResources')}
          description={t('inicio.tileResourcesDesc')}
          to={`/groups/${group.id}/recursos`}
        />
        <GroupStat
          icon={CheckSquare}
          label={t('inicio.tileTasks')}
          description={t('inicio.tileTasksDesc')}
          to={`/groups/${group.id}/tasks`}
        />
      </div>

      {/* Quick actions */}
      <GroupSection title={t('inicio.quickActions')} headingId="quick-actions-heading">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <GroupButton
            variant="secondary"
            className="justify-start"
            onClick={() => setDialog('song')}
          >
            <Music2 className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
            {t('inicio.quickAddSong')}
          </GroupButton>
          <GroupButton
            variant="secondary"
            className="justify-start"
            onClick={() => setDialog('setlist')}
          >
            <ListMusic className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
            {t('inicio.quickCreateList')}
          </GroupButton>
          <GroupButton
            variant="secondary"
            className="justify-start"
            onClick={() => setDialog('event')}
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
            {t('inicio.quickCreateEvent')}
          </GroupButton>
          <GroupButton
            variant="secondary"
            className="justify-start"
            onClick={() => setDialog('task')}
          >
            <CheckSquare className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
            {t('inicio.quickCreateTask')}
          </GroupButton>
          <GroupButton
            variant="secondary"
            className="justify-start"
            onClick={() => setDialog('resource')}
          >
            <Library className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
            {t('inicio.quickAddResource')}
          </GroupButton>
          {isOwner ? (
            <GroupButton
              variant="secondary"
              className="justify-start"
              onClick={resetInvite}
            >
              <UserPlus className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
              {t('inicio.quickInviteMember')}
            </GroupButton>
          ) : null}
        </div>
      </GroupSection>

      {isOwner && setlists?.length === 0 && events?.length === 0 && songCount === 0 ? (
        <GroupCard
          tone="accent"
          data-testid="home-get-started"
          aria-labelledby="home-start-heading"
          className="space-y-2"
        >
          <h3 id="home-start-heading" className="font-display text-lg font-semibold text-ink">
            {t('inicio.getStartedTitle')}
          </h3>
          <p className="text-sm text-muted">{t('inicio.getStartedIntro')}</p>
          <ol className="space-y-1.5">
            <li>
              <GroupLink
                variant="ghost"
                className="justify-start"
                to={`/groups/${group.id}/library`}
              >
                <Music2 className="h-4 w-4" aria-hidden="true" />
                {t('inicio.getStartedSongs')}
              </GroupLink>
            </li>
            <li>
              <GroupLink
                variant="ghost"
                className="justify-start"
                to={`/groups/${group.id}/setlists`}
              >
                <ListMusic className="h-4 w-4" aria-hidden="true" />
                {t('inicio.getStartedSetlists')}
              </GroupLink>
            </li>
            <li>
              <GroupLink
                variant="ghost"
                className="justify-start"
                to={`/groups/${group.id}/events`}
              >
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {t('inicio.getStartedEvents')}
              </GroupLink>
            </li>
          </ol>
        </GroupCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <GroupSection title={t('inicio.nextEvent')} headingId="next-event-heading">
          {events === null ? (
            <GroupListSkeleton rows={2} label={t('inicio.loadingEvents')} />
          ) : nextEvent ? (
            <GroupCard
              padding="sm"
              className="space-y-3"
              data-testid="home-next-event"
            >
              <div className="flex flex-wrap items-center gap-3">
                <GroupIconWell icon={CalendarDays} size="lg" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate font-semibold text-ink">{nextEvent.title}</p>
                  <p className="text-sm text-muted">{formatStartsAt(nextEvent.startsAt)}</p>
                  <p className="text-xs text-muted">{formatEventType(nextEvent.type)}</p>
                </div>
              </div>
              <p className="text-sm text-muted" data-testid="home-next-event-rsvp">
                {t('inicio.myRsvp')}{' '}
                <strong>{myRsvp === undefined ? '…' : formatRsvpLabel(myRsvp)}</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                <GroupLink
                  variant="primary"
                  to={`/groups/${group.id}/events/${nextEvent.id}`}
                  data-testid="home-next-event-plan"
                >
                  {t('inicio.viewPlan')}
                </GroupLink>
                <GroupLink
                  variant="secondary"
                  to={`/groups/${group.id}/events/${nextEvent.id}`}
                >
                  {t('inicio.confirmRsvp')}
                </GroupLink>
              </div>
            </GroupCard>
          ) : (
            <GroupEmptyState
              icon={CalendarDays}
              title={t('inicio.noEventsTitle')}
              description={isOwner ? t('inicio.noEventsOwner') : t('inicio.noEventsMember')}
              action={
                <GroupLink
                  variant="soft"
                  to={`/groups/${group.id}/events`}
                  data-testid="home-empty-events"
                >
                  {t('inicio.goEvents')}
                </GroupLink>
              }
            />
          )}
        </GroupSection>

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
            <ul className="space-y-1.5">
              {latestSongs.map((song, index) => (
                <li key={song.id}>
                  <GroupLink
                    variant="secondary"
                    block
                    className="h-auto min-h-11 justify-start gap-3 px-3 py-2.5"
                    to={`/groups/${group.id}/songs/${song.id}`}
                    style={{ animationDelay: `${Math.min(index, 4) * 40}ms` }}
                  >
                    <GroupIconWell icon={Music2} tone="success" />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate font-semibold text-ink">{song.title}</span>
                      <span className="mt-0.5 block truncate text-sm text-muted">
                        {song.attribution ? `${song.attribution} · ` : ''}
                        {formatRelativeUpdated(song.updatedAt)}
                      </span>
                    </span>
                  </GroupLink>
                </li>
              ))}
            </ul>
          )}
        </GroupSection>
      </div>

      <GroupCard
        padding="none"
        className="overflow-hidden border-0 px-5 py-6 text-white"
        style={{ backgroundImage: 'linear-gradient(135deg, var(--brand-primary, #8366f1), #2b1a5e)' }}
      >
        <p className="max-w-xl text-lg font-semibold leading-snug">{t('inicio.promoTitle')}</p>
        <p className="mt-1 text-sm text-white/80">— {group.name}</p>
      </GroupCard>

      {isOwner ? (
        <GroupSection
          title={t('inicio.admin')}
          headingId="admin-heading"
          className="border-t border-border-subtle pt-6"
        >
          <GroupCard className="max-w-xl space-y-3">
            <h3 className="font-medium">{t('inicio.inviteTitle')}</h3>
            <GroupInput
              label={t('inicio.inviteEmail')}
              type="email"
              autoComplete="off"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <GroupButton disabled={inviting} onClick={() => void onInviteMember()}>
              {inviting ? t('inicio.working') : t('inicio.invite')}
            </GroupButton>
            <GroupErrorState message={inviteError} />
            {inviteEmailWarning ? (
              <GroupCard tone="muted" padding="sm" role="status" className="text-sm text-ink">
                {t('inicio.inviteMailWarning')}
              </GroupCard>
            ) : null}
            {inviteUrl ? (
              <div className="space-y-2">
                <GroupInput
                  label={t('inicio.inviteLinkLabel')}
                  readOnly
                  value={inviteUrl}
                />
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
          onCreated={(setlist) => {
            setDialog(null)
            refresh()
            navigate(`/groups/${group.id}/setlists/${setlist.id}`)
          }}
        />
      ) : null}

      {dialog === 'event' ? (
        <CreateEventDialog
          groupId={group.id}
          onClose={() => setDialog(null)}
          onCreated={(event) => {
            setDialog(null)
            refresh()
            navigate(`/groups/${group.id}/events/${event.id}`)
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
