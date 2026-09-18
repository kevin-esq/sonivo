import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Calendar, CalendarDays, Mic2, Search, Sparkles } from 'lucide-react'
import {
  createEvent,
  listEvents,
  type CurrentUser,
  type EventListItem,
  type EventType,
} from '../api/client'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { fieldClass } from '../ui/field'
import { EmptyPanel, Field, FormActions, PageBreadcrumb } from '../repertoire/chrome'
import {
  isOwnerRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from '../repertoire/ui'
import { formatEventType, formatStartsAt, fromDatetimeLocalValue } from './datetime'

const EVENT_TILES = [
  { Icon: CalendarDays, tileClass: 'bg-primary/15 text-primary' },
  { Icon: Mic2, tileClass: 'bg-accent/20 text-accent' },
  { Icon: Sparkles, tileClass: 'bg-success/20 text-neutral-dark' },
  { Icon: Calendar, tileClass: 'bg-secondary text-neutral-dark' },
] as const

function eventTile(index: number) {
  return EVENT_TILES[index % EVENT_TILES.length]!
}

export function EventListPage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [events, setEvents] = useState<EventListItem[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [query, setQuery] = useState('')

  const isOwner = isOwnerRole(group?.role)

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
    return <p aria-live="polite">Cargando eventos…</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="font-semibold text-primary no-underline hover:underline" to="/">
          Mis grupos
        </Link>
      </div>
    )
  }

  const showHeaderAdd = isOwner && !showCreate && events !== null && events.length > 0

  return (
    <section className="space-y-6" aria-labelledby="events-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <PageBreadcrumb
            items={[{ to: `/groups/${group.id}`, label: group.name }, { label: 'Eventos' }]}
          />
          <h1 id="events-heading" className="text-2xl font-bold tracking-tight">
            Eventos
          </h1>
          <p className="text-sm text-slate-500">
            Ensaya y toca con un plan copiado para cada ocasión.
          </p>
          {!isOwner ? <p className="text-sm text-slate-500">Solo lectura</p> : null}
        </div>
        {showHeaderAdd ? (
          <Button onClick={() => setShowCreate(true)}>Nuevo evento</Button>
        ) : null}
      </div>

      <ProblemAlert message={listError} />

      {events !== null && events.length > 0 ? (
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            className={cn(fieldClass, 'pl-9')}
            type="search"
            placeholder="Buscar eventos…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar eventos"
          />
        </div>
      ) : null}

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
                  className="font-semibold text-primary no-underline hover:underline"
                  to={`/groups/${group.id}/library`}
                >
                  Ir a la biblioteca
                </Link>
              )
            }
          />
        )
      ) : filtered && filtered.length === 0 ? (
        <p className="text-sm text-slate-500">Ningún evento coincide con «{query.trim()}».</p>
      ) : (
        <ul className="space-y-1.5">
          {filtered!.map((musicalEvent, index) => {
            const { Icon, tileClass } = eventTile(index)
            return (
              <li
                key={musicalEvent.id}
                className="library-enter"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <Link
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 no-underline transition duration-150 hover:border-primary/25 hover:bg-neutral-light"
                  to={`/groups/${group.id}/events/${musicalEvent.id}`}
                >
                  <span
                    className={cn(
                      'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                      tileClass,
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-neutral-dark">
                      {musicalEvent.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-500">
                      {formatEventType(musicalEvent.type)} · {formatStartsAt(musicalEvent.startsAt)}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
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
    <form className="max-w-lg space-y-4 border-t border-slate-200 pt-6" onSubmit={onSubmit} noValidate>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Crear evento</h2>
        <p className="text-sm text-slate-500">
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
