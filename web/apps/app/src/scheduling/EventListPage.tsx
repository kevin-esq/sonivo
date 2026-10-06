import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Calendar, CalendarDays, ChevronRight, Mic2, Search, Sparkles } from 'lucide-react'
import { fetchFeatures, listEvents, type CurrentUser, type EventListItem } from '../api/client'
import { cn } from '../ui/cn'
import {
  GroupButton,
  GroupEmptyState,
  GroupErrorState,
  GroupIconWell,
  GroupLimitNotice,
  GroupLink,
  GroupListSkeleton,
  GroupPageHeader,
  GroupPageSkeleton,
  groupFieldClass,
  limitReached,
  useGroupDataSignal,
} from '../groups/ui'
import { useGroupUsage } from '../groups/useGroupUsage'
import { CreateEventDialog } from '../groups/dialogs'
import { ReadinessChip } from '../repertoire/chrome'
import {
  canManageContentRole,
  mutationErrorMessage,
  useGroupContext,
} from '../repertoire/ui'
import { useT } from '../i18n'
import { plural } from '../ui/plural'
import { formatEventType, formatStartsAt } from './datetime'

const EVENT_ICONS = [CalendarDays, Mic2, Sparkles, Calendar] as const

function eventIcon(index: number) {
  return EVENT_ICONS[index % EVENT_ICONS.length]!
}

export function EventListPage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const { group, error: groupError, reload: reloadGroup } = useGroupContext(groupId, user.id)
  const { t } = useT()
  const navigate = useNavigate()
  const [events, setEvents] = useState<EventListItem[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [query, setQuery] = useState('')
  const [calendarEnabled, setCalendarEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchFeatures()
      .then((flags) => {
        if (!cancelled) setCalendarEnabled(flags.notifications === true)
      })
      .catch(() => {
        if (!cancelled) setCalendarEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isOwner = canManageContentRole(group?.role)
  const { usage, reload: reloadUsage } = useGroupUsage(groupId)
  const eventsAtLimit = limitReached(usage?.eventsThisMonth)

  const filtered = useMemo(() => {
    if (!events) return null
    const q = query.trim().toLowerCase()
    if (!q) return events
    return events.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        formatEventType(item.type).toLowerCase().includes(q),
    )
  }, [events, query])

  async function reload() {
    if (!groupId) return
    setListError(null)
    try {
      setEvents(await listEvents(groupId))
    } catch (err) {
      setEvents([])
      setListError(mutationErrorMessage(err))
    }
  }

  useEffect(() => {
    if (!groupId || !group) return
    let cancelled = false
    async function load() {
      setEvents(null)
      setListError(null)
      try {
        const result = await listEvents(groupId!)
        if (!cancelled) setEvents(result)
      } catch (err) {
        if (cancelled) return
        setEvents([])
        setListError(mutationErrorMessage(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, group])

  // Live refresh when events change elsewhere (creation dialog, other tab).
  useGroupDataSignal('events', groupId, () => {
    void reload()
    void reloadUsage()
  })

  if (group === undefined) {
    return <GroupPageSkeleton label={t('agenda.loadingEvents')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState message={groupError} onRetry={() => void reloadGroup()} />
        <GroupLink variant="soft" to="/">
          {t('agenda.myGroups')}
        </GroupLink>
      </div>
    )
  }

  const showHeaderAdd = isOwner && events !== null && events.length > 0
  const searching = query.trim().length > 0

  return (
    <section className="space-y-6" aria-labelledby="events-heading">
      <div data-testid="events-hero">
        <GroupPageHeader
          headingId="events-heading"
          icon={CalendarDays}
          title={t('agenda.eventsTitle')}
          subtitle={t('agenda.eventsSubtitle')}
          breadcrumb={[
            { to: `/groups/${group.id}`, label: group.name },
            { label: t('agenda.eventsTitle') },
          ]}
          actions={
            <>
              {events !== null ? (
                <>
                  <ReadinessChip testId="events-count" tone="neutral">
                    {plural(events.length, t('common.eventOne'), t('common.eventMany'))}
                  </ReadinessChip>
                  {calendarEnabled && groupId ? (
                    <a
                      data-testid="events-calendar-feed"
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-ink no-underline hover:underline"
                      href={`/api/groups/${groupId}/calendar.ics`}
                    >
                      {t('agenda.calendarFeed')}
                    </a>
                  ) : null}
                </>
              ) : null}
              {showHeaderAdd ? (
                <GroupButton onClick={() => setShowCreate(true)} disabled={eventsAtLimit}>Nuevo evento</GroupButton>
              ) : null}
            </>
          }
        >
          {!isOwner ? <p className="text-sm text-muted">Solo lectura</p> : null}
        </GroupPageHeader>
      </div>

      {events !== null && events.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-52 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <label className="sr-only" htmlFor="events-search">
              {t('agenda.eventsSearchLabel')}
            </label>
            <input
              id="events-search"
              data-testid="events-search"
              className={cn(groupFieldClass, 'pl-9')}
              type="search"
              placeholder={t('agenda.eventsSearchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('agenda.eventsSearchLabel')}
            />
          </div>
        </div>
      ) : null}
      {searching && filtered !== null ? (
        <p role="status" aria-live="polite" data-testid="events-results" className="text-sm text-muted">
          {plural(filtered.length, t('common.resultOne'), t('common.resultMany'))}
        </p>
      ) : null}

      <GroupErrorState message={listError} />

      <GroupLimitNotice
        label="eventos este mes"
        metric={usage?.eventsThisMonth}
        upgradeHref={`/groups/${group.id}/ajustes?tab=plan`}
      />

      {events === null ? (
        <GroupListSkeleton rows={3} label={t('agenda.loadingEvents')} />
      ) : events.length === 0 ? (
        <GroupEmptyState
          icon={CalendarDays}
          title="Aún no hay eventos"
          description={
            isOwner
              ? 'Crea un ensayo o concierto y aplica una lista para copiar el plan de canciones.'
              : 'Cuando haya eventos, aparecerán aquí para prepararte.'
          }
          action={
            isOwner ? (
              <GroupButton
                data-testid="events-empty-create"
                onClick={() => setShowCreate(true)}
                disabled={eventsAtLimit}
              >
                Nuevo evento
              </GroupButton>
            ) : (
              <GroupLink variant="soft" to={`/groups/${group.id}/library`}>
                Ir a la biblioteca
              </GroupLink>
            )
          }
        />
      ) : filtered && filtered.length === 0 ? (
        <GroupEmptyState title={`Ningún evento coincide con «${query.trim()}».`} />
      ) : (
        <div className="space-y-1">
          <div
            aria-hidden="true"
            className="hidden px-2 text-xs font-semibold uppercase tracking-wide text-muted sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto_1.5rem] sm:items-center sm:gap-3"
          >
            <span>{t('agenda.eventsColEvent')}</span>
            <span>{t('agenda.eventsColWhen')}</span>
            <span>{t('agenda.eventsColStatus')}</span>
            <span />
          </div>
          <ul className="space-y-1 sm:space-y-0 sm:divide-y sm:divide-border-subtle sm:rounded-2xl sm:border sm:border-border-subtle sm:bg-surface">
            {filtered!.map((musicalEvent, index) => {
              const Icon = eventIcon(index)
              const cancelled = musicalEvent.status === 'cancelled'
              return (
                <li
                  key={musicalEvent.id}
                  className="library-enter"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <Link
                    className="flex min-h-[44px] items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-3 py-2.5 no-underline shadow-sm transition duration-150 hover:border-primary/25 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] motion-reduce:transition-none sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none sm:first:rounded-t-2xl sm:last:rounded-b-2xl"
                    to={`/groups/${group.id}/events/${musicalEvent.id}`}
                  >
                    <GroupIconWell icon={Icon} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">
                        {musicalEvent.title}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {formatEventType(musicalEvent.type)} · {formatStartsAt(musicalEvent.startsAt)}
                      </span>
                    </span>
                    <ReadinessChip
                      tone={cancelled ? 'warn' : 'ok'}
                      testId={`event-status-${musicalEvent.id}`}
                    >
                      {cancelled ? t('agenda.statusCancelled') : t('agenda.statusScheduled')}
                    </ReadinessChip>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {isOwner && showCreate ? (
        <CreateEventDialog
          groupId={group.id}
          onClose={() => setShowCreate(false)}
          onCreated={(event) => {
            setShowCreate(false)
            void reload()
            void reloadUsage()
            navigate(`/groups/${group.id}/events/${event.id}`)
          }}
        />
      ) : null}
    </section>
  )
}
