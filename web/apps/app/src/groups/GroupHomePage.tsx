import { routes } from '../routing/routes'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CalendarDays,
  CheckSquare,
  Check,
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
import { useBrandPreview } from '../shell/brandPreview'
import { groupCoverStyle } from '../shell/groupAccent'

type HomeDialog = 'song' | 'setlist' | 'event' | 'task' | 'resource'

function pickUpcoming(events: EventListItem[]): EventListItem[] {
  const now = Date.now()
  return events
    .filter((event) => event.status === 'scheduled')
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .filter((event) => new Date(event.startsAt).getTime() >= now - 12 * 3600_000)
    .slice(0, 4)
}

function formatRelativeUpdated(iso: string, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(date)
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

function eventDateParts(iso: string, language: string): { weekday: string; day: string; month: string } {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { weekday: '', day: '', month: '' }
  const weekday = new Intl.DateTimeFormat(language, { weekday: 'short' }).format(date).slice(0, 3)
  const month = new Intl.DateTimeFormat(language, { month: 'short' }).format(date).slice(0, 3)
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
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)
  const { t, lang } = useT()
  const { draft: brandPreview, savedBrand } = useBrandPreview()
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
        setError(err instanceof ApiError && err.status === 404 ? t('dashboard.notFound') : mutationErrorMessage(err, t))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, user.id])

  useEffect(() => {
    if (!groupId) return
    try {
      setOnboardingDismissed(
        window.localStorage.getItem(`sonivo:onboarding:${user.id}:${groupId}`) === 'dismissed',
      )
    } catch {
      setOnboardingDismissed(false)
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
        setComposeError(mutationErrorMessage(err, t))
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
  const onboardingSteps = isOwner
    ? [
        { done: (recentSongs?.length ?? 0) > 0, to: routes.groupLibrary(group?.id ?? ''), label: t('dashboard.getStartedSongs') },
        { done: (usage?.members.used ?? 1) > 1, to: routes.groupPeople(group?.id ?? ''), label: t('dashboard.getStartedPeople') },
        { done: (setlists?.length ?? 0) > 0, to: routes.groupSetlists(group?.id ?? ''), label: t('dashboard.getStartedSetlists') },
        { done: (events?.length ?? 0) > 0, to: routes.groupEvents(group?.id ?? ''), label: t('dashboard.getStartedEvents') },
      ]
    : [
        { done: (recentSongs?.length ?? 0) > 0, to: routes.groupLibrary(group?.id ?? ''), label: t('dashboard.memberGuideMusic') },
        { done: (events?.length ?? 0) > 0, to: routes.groupEvents(group?.id ?? ''), label: t('dashboard.memberGuideEvents') },
      ]
  const onboardingComplete = onboardingSteps.every((step) => step.done)
  const completedSteps = onboardingSteps.filter((step) => step.done).length
  const canShowOnboarding = recentSongs !== null && events !== null
    && (isOwner ? setlists !== null && !onboardingComplete : true)
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
        <GroupLink variant="soft" to={routes.home}>
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
  const activeBrandPreview = brandPreview?.groupId === groupId ? brandPreview : null
  const activeSavedBrand = savedBrand?.groupId === groupId ? savedBrand : null
  const activeCover = activeBrandPreview?.cover ?? activeSavedBrand?.cover ?? 'none'
  const previewBanner = activeBrandPreview?.pendingImages.banner?.url ?? (
    activeBrandPreview
      ? activeBrandPreview.cover === activeBrandPreview.savedCover
        ? activeBrandPreview.savedBannerUrl
        : null
      : activeSavedBrand?.bannerUrl
  )
  const heroStyle = activeBrandPreview || activeSavedBrand
    ? previewBanner
      ? {
          backgroundImage: `linear-gradient(rgba(15,23,42,0.56), rgba(15,23,42,0.56)), url(${previewBanner})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : groupCoverStyle(activeCover, activeBrandPreview?.editor.accentHex || activeSavedBrand?.accentHex || '#8366f1')
    : undefined
  const heroTitle = activeBrandPreview?.displayName.trim() || activeBrandPreview?.groupName || activeSavedBrand?.displayName || group.name
  const heroTagline = activeBrandPreview
    ? activeBrandPreview.tagline || activeBrandPreview.editor.welcomeText || t('home.welcomeSubtitle')
    : activeSavedBrand?.tagline || activeSavedBrand?.welcomeText || t('home.welcomeSubtitle')

  return (
    <section className="space-y-8" aria-label={group.name}>
      {/* Welcome hero (owner reference 2026-10-07) */}
      <div
        className="group-home-hero relative overflow-hidden rounded-2xl px-6 py-7 text-white shadow-sm sm:px-8 sm:py-9"
        data-testid="home-hero"
        style={heroStyle}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">{t('home.welcomeTitle')}</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight md:text-4xl">
          {heroTitle}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-white/85">
          {heroTagline}
        </p>
        {(activeBrandPreview?.verse || activeSavedBrand?.verse) ? (
          <p className="mt-2 max-w-xl text-xs italic text-white/75">{activeBrandPreview?.verse ?? activeSavedBrand?.verse}</p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <GroupLink
            to={routes.groupLibrary(group.id)}
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

      {canShowOnboarding ? (
        onboardingDismissed ? (
          <button
            type="button"
            onClick={() => {
              try {
                window.localStorage.removeItem(`sonivo:onboarding:${user.id}:${group.id}`)
              } catch {
                // Keep this optional preference usable when storage is unavailable.
              }
              setOnboardingDismissed(false)
            }}
            className="onboarding-reopen min-h-11 rounded-xl px-3 text-sm font-semibold text-primary-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t('onboarding.show')}
          </button>
        ) : (
          <section aria-labelledby="onboarding-title" className="onboarding-card rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 id="onboarding-title" className="text-lg font-semibold text-ink">{t('dashboard.getStartedTitle')}</h2>
                <p className="text-sm text-muted">{t(isOwner ? 'dashboard.getStartedIntro' : 'dashboard.memberGuideIntro')}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  try {
                    window.localStorage.setItem(`sonivo:onboarding:${user.id}:${group.id}`, 'dismissed')
                  } catch {
                    // Dismissing the guide must not depend on browser storage.
                  }
                  setOnboardingDismissed(true)
                }}
                className="onboarding-card__dismiss min-h-11 rounded-xl px-3 text-sm font-medium text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {t('onboarding.dismiss')}
              </button>
            </div>
            <ol className="onboarding-card__steps mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {onboardingSteps.map((step, index) => (
                <li key={step.to}>
                  <GroupLink to={step.to} variant={step.done ? 'soft' : 'secondary'} className={`onboarding-step h-full w-full justify-start gap-3 whitespace-normal text-left ${step.done ? 'is-done' : ''}`}>
                    <span className="onboarding-step__marker grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-xs font-bold text-primary-ink" aria-hidden="true">
                      {step.done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-sm">{step.label}</span>
                    <ChevronRight className="onboarding-step__arrow h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                  </GroupLink>
                </li>
              ))}
            </ol>
            <div className="onboarding-card__progress mt-4" aria-live="polite">
              <span className="text-xs text-muted">
                {t('onboarding.progress', { done: completedSteps, total: onboardingSteps.length })}
              </span>
              <div
                className="onboarding-card__progress-track"
                role="progressbar"
                aria-label={t('dashboard.getStartedTitle')}
                aria-valuemin={0}
                aria-valuemax={onboardingSteps.length}
                aria-valuenow={completedSteps}
              >
                <span style={{ transform: `scaleX(${completedSteps / onboardingSteps.length})` }} />
              </div>
            </div>
            {!isOwner ? (
              <p className="mt-3 text-sm text-muted">
                <Link className="font-medium text-primary-ink underline-offset-4 hover:underline" to={routes.help}>
                  {t('dashboard.memberGuideHelp')}
                </Link>
              </p>
            ) : null}
          </section>
        )
      ) : null}

      {/* Metrics (home only): live counts from the group usage endpoint. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="home-metrics">
        <GroupStat
          icon={Music2}
          label={t('songs.pageTitle')}
          value={usage?.songs.used ?? '—'}
          to={routes.groupLibrary(group.id)}
          testId="home-metric-songs"
        />
        <GroupStat
          icon={ListMusic}
          label={t('nav.setlists')}
          value={usage?.setlists.used ?? '—'}
          to={routes.groupSetlists(group.id)}
          testId="home-metric-setlists"
        />
        <GroupStat
          icon={CalendarDays}
          label={t('nav.events')}
          value={usage?.eventsThisMonth.used ?? '—'}
          to={routes.groupEvents(group.id)}
          testId="home-metric-events"
        />
        <GroupStat
          icon={Users}
          label={t('nav.people')}
          value={usage?.members.used ?? '—'}
          to={routes.groupPeople(group.id)}
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
              to={routes.groupPeople(group.id)}
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
          <GroupLink variant="ghost" size="sm" to={routes.groupEvents(group.id)}>
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
              <GroupLink variant="soft" to={routes.groupEvents(group.id)} data-testid="home-empty-events">
                {t('dashboard.goEvents')}
              </GroupLink>
            }
          />
        ) : (
          <ul className="space-y-2">
            {upcoming.map((event, index) => {
              const parts = eventDateParts(event.startsAt, lang)
              return (
                <li key={event.id}>
                  <Link
                    to={routes.groupEvent(group.id, event.id)}
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
                        {formatEventType(event.type, t)} · {formatStartsAt(event.startsAt, lang)}
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
          <GroupLink variant="ghost" size="sm" to={routes.groupLibrary(group.id)}>
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
              <GroupLink variant="soft" to={routes.groupLibrary(group.id)}>
                {t('dashboard.goSongs')}
              </GroupLink>
            }
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {latestSongs.map((song) => (
              <li key={song.id}>
                <Link
                  to={routes.groupSong(group.id, song.id)}
                  className="flex min-h-16 items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-3 py-2.5 no-underline transition duration-150 hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
                >
                  <GroupIconWell icon={Music2} tone="success" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{song.title}</span>
                    <span className="mt-0.5 block truncate text-sm text-muted">
                      {song.attribution ? `${song.attribution} · ` : ''}
                      {formatRelativeUpdated(song.updatedAt, lang)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </GroupSection>

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
