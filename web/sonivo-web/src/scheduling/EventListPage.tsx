import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Calendar, CalendarDays, ChevronRight, Mic2, Search, Sparkles } from 'lucide-react'
import {
  createEvent,
  fetchFeatures,
  listEvents,
  type CurrentUser,
  type EventListItem,
  type EventType,
} from '../api/client'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { fieldClass } from '../ui/field'
import { EmptyPanel, Field, FormActions, PageBreadcrumb, ReadinessChip } from '../repertoire/chrome'
import {
  canManageContentRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from '../repertoire/ui'
import { useT } from '../i18n'
import { plural } from '../ui/plural'
import { formatEventType, formatStartsAt, fromDatetimeLocalValue } from './datetime'

const EVENT_TILES = [
  { Icon: CalendarDays, tileClass: 'bg-primary/15 text-primary-ink' },
  { Icon: Mic2, tileClass: 'bg-accent/20 text-accent' },
  { Icon: Sparkles, tileClass: 'bg-success/20 text-ink' },
  { Icon: Calendar, tileClass: 'bg-secondary text-ink' },
] as const

function eventTile(index: number) {
  return EVENT_TILES[index % EVENT_TILES.length]!
}

export function EventListPage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const { t } = useT()
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

  if (group === undefined) {
    return <p aria-live="polite">{t('agenda.loadingEvents')}</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="font-semibold text-primary-ink no-underline hover:underline" to="/">
          {t('agenda.myGroups')}
        </Link>
      </div>
    )
  }

  const showHeaderAdd = isOwner && !showCreate && events !== null && events.length > 0
  const searching = query.trim().length > 0

  return (
    <section className="space-y-6" aria-labelledby="events-heading">
      <header data-testid="events-hero" className="space-y-3">
        <PageBreadcrumb
          items={[{ to: `/groups/${group.id}`, label: group.name }, { label: t('agenda.eventsTitle') }]}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 id="events-heading" className="text-3xl font-bold tracking-tight text-ink">
              {t('agenda.eventsTitle')}
            </h1>
            <p className="max-w-lg text-sm text-muted">{t('agenda.eventsSubtitle')}</p>
            {!isOwner ? <p className="text-sm text-muted">Solo lectura</p> : null}
          </div>
          {events !== null ? (
            <div className="flex items-center gap-4">
              <ReadinessChip testId="events-count" tone="neutral">
                {plural(events.length, t('common.eventOne'), t('common.eventMany'))}
              </ReadinessChip>
              {calendarEnabled && groupId ? (
                <a
                  data-testid="events-calendar-feed"
                  className="text-sm font-semibold text-primary-ink no-underline hover:underline"
                  href={`/api/groups/${groupId}/calendar.ics`}
                >
                  {t('agenda.calendarFeed')}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

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
              className={cn(fieldClass, 'min-h-11 pl-9')}
              type="search"
              placeholder={t('agenda.eventsSearchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('agenda.eventsSearchLabel')}
            />
          </div>
          {showHeaderAdd ? <Button onClick={() => setShowCreate(true)}>Nuevo evento</Button> : null}
        </div>
      ) : null}
      {searching && filtered !== null ? (
        <p role="status" aria-live="polite" data-testid="events-results" className="text-sm text-muted">
          {plural(filtered.length, t('common.resultOne'), t('common.resultMany'))}
        </p>
      ) : null}

      <ProblemAlert message={listError} />

      {events === null ? (
        <p aria-live="polite">Cargando eventos…</p>
      ) : events.length === 0 ? (
        showCreate ? null : (
          <EmptyPanel
            title="Aún no hay eventos"
            description={
              isOwner
                ? 'Crea un ensayo o concierto y aplica una lista para copiar el plan de canciones.'
                : 'Cuando haya eventos, aparecerán aquí para prepararte.'
            }
            action={
              isOwner ? (
                <Button data-testid="events-empty-create" onClick={() => setShowCreate(true)}>
                  Nuevo evento
                </Button>
              ) : (
                <Link
                  className="font-semibold text-primary-ink no-underline hover:underline"
                  to={`/groups/${group.id}/library`}
                >
                  Ir a la biblioteca
                </Link>
              )
            }
          />
        )
      ) : filtered && filtered.length === 0 ? (
        <p className="text-sm text-muted">Ningún evento coincide con «{query.trim()}».</p>
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
              const { Icon, tileClass } = eventTile(index)
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
                    <span
                      className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11',
                        tileClass,
                      )}
                      aria-hidden="true"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
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
        <EventCreateForm
          groupId={group.id}
          onCancel={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false)
            await reload()
          }}
        />
      ) : null}
    </section>
  )
}

function EventCreateForm({
  groupId,
  onCreated,
  onCancel,
}: {
  groupId: string
  onCreated: () => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<EventType>('rehearsal')
  const [startsAt, setStartsAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    if (!startsAt) {
      setError('La fecha y hora de inicio son obligatorias.')
      setPending(false)
      return
    }
    try {
      const created = await createEvent(groupId, {
        title: title.trim(),
        type,
        startsAt: fromDatetimeLocalValue(startsAt),
      })
      await onCreated()
      navigate(`/groups/${groupId}/events/${created.id}`)
    } catch (err) {
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="max-w-lg space-y-4 border-t border-border-subtle pt-6" onSubmit={onSubmit} noValidate>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Crear evento</h2>
        <p className="text-sm text-muted">
          Define los detalles de tu evento y luego aplica una lista.
        </p>
      </div>
      <ProblemAlert message={error} />
      <Field label="Título">
        <input
          className={fieldClass}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label="Tipo">
        <select
          className={fieldClass}
          required
          value={type}
          onChange={(e) => setType(e.target.value as EventType)}
        >
          <option value="rehearsal">Ensayo</option>
          <option value="performance">Concierto</option>
          <option value="other">Otro</option>
        </select>
      </Field>
      <Field label="Fecha y hora">
        <input
          className={fieldClass}
          type="datetime-local"
          required
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? 'Creando…' : 'Crear evento'}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </FormActions>
    </form>
  )
}
