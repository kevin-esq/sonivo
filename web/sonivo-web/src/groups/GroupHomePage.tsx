import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, ListMusic, Music2 } from 'lucide-react'
import {
  ApiError,
  createInvitation,
  deleteGroup,
  getGroup,
  listEventRsvps,
  listEvents,
  listSetlists,
  listSongs,
  problemDetail,
  updateGroup,
  type CurrentUser,
  type EventListItem,
  type EventRsvpResponse,
  type GroupDetail,
  type SetlistListItem,
} from '../api/client'
import {
  ConfirmDialog,
  CONFLICT_MESSAGE,
  ConflictAlert,
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
import { Skeleton } from '../ui/skeleton'
import { formatEventType, formatStartsAt } from '../scheduling/datetime'

const RECENT_SETLIST_LIMIT = 5

function greetingName(user: CurrentUser): string {
  const raw = user.displayName?.trim() || user.email?.split('@')[0] || 'allí'
  return raw
}

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

function formatSongCount(count: number): string {
  return count === 1 ? '1 canción' : `${count} canciones`
}

function formatSetlistItemCount(count: number): string {
  return count === 1 ? '1 canción' : `${count} canciones`
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
      return 'Sin respuesta'
  }
}

export function GroupHomePage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<EventListItem[] | null>(null)
  const [setlists, setSetlists] = useState<SetlistListItem[] | null>(null)
  const [songCount, setSongCount] = useState<number | null>(null)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [myRsvp, setMyRsvp] = useState<EventRsvpResponse | string | null | undefined>(undefined)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteEmailWarning, setInviteEmailWarning] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [renameConflict, setRenameConflict] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const navigate = useNavigate()
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
      setComposeError(null)
      try {
        const result = await getGroup(groupId)
        if (!cancelled) {
          setGroup(result)
          setRenameName(result.name)
        }
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
  const recentSetlists = useMemo(
    () => (setlists ? setlists.slice(0, RECENT_SETLIST_LIMIT) : null),
    [setlists],
  )
  const scheduledCount = useMemo(
    () => (events ? events.filter((e) => e.status === 'scheduled').length : null),
    [events],
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

  async function onRename(event: FormEvent) {
    event.preventDefault()
    if (!group) return
    setRenaming(true)
    setRenameError(null)
    setRenameConflict(null)
    try {
      const updated = await updateGroup(group.id, {
        name: renameName,
        expectedVersion: group.version,
      })
      setGroup(updated)
      setRenameName(updated.name)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setRenameConflict(CONFLICT_MESSAGE)
        try {
          const latest = await getGroup(group.id)
          setGroup(latest)
          setRenameName(latest.name)
        } catch (reloadErr) {
          setRenameError(mutationErrorMessage(reloadErr))
        }
      } else {
        setRenameError(mutationErrorMessage(err))
      }
    } finally {
      setRenaming(false)
    }
  }

  async function onConfirmDelete() {
    if (!group) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteGroup(group.id, group.version)
      setDeleteOpen(false)
      navigate('/')
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDeleteError(CONFLICT_MESSAGE)
        try {
          const latest = await getGroup(group.id)
          setGroup(latest)
          setRenameName(latest.name)
        } catch (reloadErr) {
          setDeleteError(mutationErrorMessage(reloadErr))
        }
      } else {
        setDeleteError(mutationErrorMessage(err))
      }
    } finally {
      setDeleting(false)
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
        <p role="alert" className="text-error">
          {error}
        </p>
        <Link className="font-semibold text-primary no-underline hover:underline" to="/">
          {t('inicio.myGroups')}
        </Link>
      </div>
    )
  }

  const hello = greetingName(user)

  return (
    <section className="space-y-8" aria-labelledby="group-heading">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{t('inicio.helloPrefix')}{hello}{t('inicio.helloSuffix')}</h1>
        <h2 id="group-heading" className="text-lg font-semibold text-neutral-dark">
          {group.name}
        </h2>
        <p className="text-sm text-slate-500">
          {t('inicio.summary')}
        </p>
        <p className="text-sm text-slate-500">
          {t('inicio.rolePrefix')}<strong>{formatMembershipRole(group.role)}</strong>.
        </p>
      </div>

      <ProblemAlert message={composeError} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
          <p className="text-sm text-slate-500">{t('inicio.statSetlists')}</p>
          <p className="mt-1 text-2xl font-bold text-neutral-dark">
            {setlists === null ? <Skeleton className="mt-2 h-8 w-10" /> : setlists.length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
          <p className="text-sm text-slate-500">{t('inicio.statEvents')}</p>
          <p className="mt-1 text-2xl font-bold text-neutral-dark">
            {scheduledCount === null ? <Skeleton className="mt-2 h-8 w-10" /> : scheduledCount}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
          <p className="text-sm text-slate-500">{t('inicio.statSongs')}</p>
          <p className="mt-1 text-2xl font-bold text-neutral-dark">
            {songCount === null ? <Skeleton className="mt-2 h-8 w-10" /> : songCount}
          </p>
          {songCount !== null ? (
            <p className="mt-0.5 text-xs text-slate-400">{formatSongCount(songCount)}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3" aria-labelledby="next-event-heading">
          <h3 id="next-event-heading" className="font-semibold">
            {t('inicio.nextEvent')}
          </h3>
          {events === null ? (
            <p aria-live="polite" className="text-sm text-slate-500">
              {t('inicio.loadingEvents')}
            </p>
          ) : nextEvent ? (
            <div
              className="space-y-3 rounded-2xl border border-slate-100 bg-white p-3"
              data-testid="home-next-event"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
                  aria-hidden="true"
                >
                  <CalendarDays className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate font-semibold text-neutral-dark">{nextEvent.title}</p>
                  <p className="text-sm text-slate-500">{formatStartsAt(nextEvent.startsAt)}</p>
                  <p className="text-xs text-slate-400">{formatEventType(nextEvent.type)}</p>
                </div>
              </div>
              <p className="text-sm text-slate-600" data-testid="home-next-event-rsvp">
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
                  className="font-semibold text-primary no-underline hover:underline"
                  to={`/groups/${group.id}/events`}
                  data-testid="home-empty-events"
                >
                  {t('inicio.goEvents')}
                </Link>
              }
            />
          )}
        </section>

        <section className="space-y-3" aria-labelledby="recent-setlists-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="recent-setlists-heading" className="font-semibold">
              {t('inicio.recentSetlists')}
            </h3>
            <Link
              className="text-sm font-semibold text-primary no-underline hover:underline"
              to={`/groups/${group.id}/setlists`}
            >
              {t('inicio.viewAll')}
            </Link>
          </div>
          {recentSetlists === null ? (
            <p aria-live="polite" className="text-sm text-slate-500">
              {t('inicio.loadingSetlists')}
            </p>
          ) : recentSetlists.length === 0 ? (
            <EmptyPanel
              title={t('inicio.noSetlistsTitle')}
              description={
                isOwner ? t('inicio.noSetlistsOwner') : t('inicio.noSetlistsMember')
              }
              action={
                <Link
                  className="font-semibold text-primary no-underline hover:underline"
                  to={`/groups/${group.id}/setlists`}
                >
                  {t('inicio.goSetlists')}
                </Link>
              }
            />
          ) : (
            <ul className="space-y-1.5">
              {recentSetlists.map((setlist, index) => (
                <li key={setlist.id}>
                  <Link
                    className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 no-underline transition duration-150 hover:border-primary/25 hover:bg-neutral-light"
                    to={`/groups/${group.id}/setlists/${setlist.id}`}
                    style={{ animationDelay: `${Math.min(index, 4) * 40}ms` }}
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/20 text-neutral-dark"
                      aria-hidden="true"
                    >
                      <ListMusic className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-neutral-dark">
                        {setlist.name}
                      </span>
                      <span className="mt-0.5 block text-sm text-slate-500">
                        {formatSetlistItemCount(setlist.itemCount)} ·{' '}
                        {formatRelativeUpdated(setlist.updatedAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-neutral-light/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"
            aria-hidden="true"
          >
            <Music2 className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-neutral-dark">{t('inicio.libraryTitle')}</p>
            <p className="text-sm text-slate-500">
              {songCount === null ? t('inicio.loadingDots') : formatSongCount(songCount)}
              {' · '}
              <Link
                className="font-semibold text-primary no-underline hover:underline"
                to={`/groups/${group.id}/library`}
              >
                {t('inicio.openLibrary')}
              </Link>
            </p>
          </div>
        </div>
      </div>

      {isOwner ? (
        <section className="space-y-6 border-t border-slate-200 pt-6" aria-labelledby="admin-heading">
          <h2 id="admin-heading" className="text-lg font-semibold">
            {t('inicio.admin')}
          </h2>

          <div className="space-y-3">
            <h3 className="font-medium">{t('inicio.inviteTitle')}</h3>
            <label className="block max-w-md space-y-1.5">
              <span className="text-sm font-medium text-slate-700">
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
                className="rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-neutral-dark"
              >
                {t('inicio.inviteMailWarning')}
              </p>
            ) : null}
            {inviteUrl ? (
              <div className="max-w-md space-y-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">{t('inicio.inviteLinkLabel')}</span>
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
                  <p aria-live="polite" className="text-sm text-slate-600">
                    {t('inicio.copied')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <form className="max-w-md space-y-3 border-t border-slate-200 pt-6" onSubmit={onRename}>
            <h3 className="font-medium">{t('inicio.renameTitle')}</h3>
            <ConflictAlert message={renameConflict} />
            <ProblemAlert message={renameError} />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">{t('inicio.nameLabel')}</span>
              <input
                className={fieldClass}
                required
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                maxLength={200}
              />
            </label>
            <Button variant="secondary" type="submit" disabled={renaming}>
              {renaming ? t('inicio.working') : t('inicio.saveName')}
            </Button>
          </form>

          <div className="space-y-3 border-t border-slate-200 pt-6">
            <h3 className="font-medium">{t('inicio.deleteTitle')}</h3>
            <ProblemAlert message={deleteError} />
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              {t('inicio.deleteTitle')}
            </Button>
            <ConfirmDialog
              open={deleteOpen}
              title={t('inicio.deleteDialogTitle')}
              confirmLabel={t('inicio.deleteTitle')}
              cancelLabel={t('inicio.cancel')}
              pendingLabel={t('inicio.deleting')}
              pending={deleting}
              onConfirm={() => void onConfirmDelete()}
              onCancel={() => {
                if (!deleting) setDeleteOpen(false)
              }}
            >
              <p>
                {t('inicio.deleteBody')}
              </p>
            </ConfirmDialog>
          </div>
        </section>
      ) : null}
    </section>
  )
}
