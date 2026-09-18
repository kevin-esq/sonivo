import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, Copy, Music2 } from 'lucide-react'
import {
  applySetlistToEvent,
  cancelEvent,
  getEvent,
  isConflictError,
  listEventRsvps,
  listSetlists,
  patchEvent,
  upsertEventRsvp,
  type CurrentUser,
  type EventDetail,
  type EventRsvpItem,
  type EventRsvpResponse,
  type EventType,
  type SetlistListItem,
} from '../api/client'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { fieldClass } from '../ui/field'
import { EmptyPanel, Field, FormActions, PageBreadcrumb } from '../repertoire/chrome'
import {
  CONFLICT_MESSAGE,
  ConfirmDialog,
  ConflictAlert,
  isOwnerRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from '../repertoire/ui'
import {
  formatEventStatus,
  formatEventType,
  formatStartsAt,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from './datetime'

const RSVP_CHOICES: { value: EventRsvpResponse; label: string }[] = [
  { value: 'yes', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'maybe', label: 'Quizás' },
]

function formatRsvpResponse(response: string): string {
  return RSVP_CHOICES.find((choice) => choice.value === response)?.label ?? response
}

type RsvpLoad =
  | { ok: true; items: EventRsvpItem[] }
  | { ok: false; error: unknown }

async function loadEventRsvps(groupId: string, eventId: string): Promise<RsvpLoad> {
  try {
    const list = await listEventRsvps(groupId, eventId)
    return { ok: true, items: list.items }
  } catch (error) {
    return { ok: false, error }
  }
}

function isLiveEvent(status: string): boolean {
  return status !== 'cancelled'
}

function PlanNumber({ n }: { n: number }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-sm font-semibold text-primary">
      {String(n).padStart(2, '0')}
    </span>
  )
}

type DetailTab = 'plan' | 'details'

export function EventDetailPage({ user }: { user: CurrentUser }) {
  const { groupId, eventId } = useParams()
  const navigate = useNavigate()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [musicalEvent, setMusicalEvent] = useState<EventDetail | null | undefined>(undefined)
  const [setlists, setSetlists] = useState<SetlistListItem[] | null>(null)
  const [rsvps, setRsvps] = useState<EventRsvpItem[] | null>(null)
  const [selectedSetlistId, setSelectedSetlistId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [applying, setApplying] = useState(false)
  const [savingRsvp, setSavingRsvp] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [tab, setTab] = useState<DetailTab>('plan')

  const isOwner = isOwnerRole(group?.role)
  const isLive = musicalEvent != null && isLiveEvent(musicalEvent.status)
  const plan = musicalEvent?.items ?? []
  const hasPlan = plan.length >= 1
  const myResponse = rsvps?.find((item) => item.userId === user.id)?.response ?? null

  function applyRsvpLoad(result: RsvpLoad) {
    if (result.ok) {
      setRsvps(result.items)
      return
    }
    setRsvps(null)
    setError(mutationErrorMessage(result.error))
  }

  async function loadEventSurface(nextGroupId: string, nextEventId: string) {
    const [nextEvent, nextSetlists] = await Promise.all([
      getEvent(nextGroupId, nextEventId),
      listSetlists(nextGroupId),
    ])
    const rsvpLoad = isLiveEvent(nextEvent.status)
      ? await loadEventRsvps(nextGroupId, nextEventId)
      : { ok: true as const, items: [] as EventRsvpItem[] }
    return { nextEvent, nextSetlists, rsvpLoad }
  }

  async function reload() {
    if (!groupId || !eventId) return
    const { nextEvent, nextSetlists, rsvpLoad } = await loadEventSurface(groupId, eventId)
    setMusicalEvent(nextEvent)
    setSetlists(nextSetlists)
    if (!selectedSetlistId && nextSetlists[0]) {
      setSelectedSetlistId(nextSetlists[0].id)
    }
    applyRsvpLoad(rsvpLoad)
  }

  useEffect(() => {
    if (!groupId || !eventId || !group) return
    let cancelled = false
    async function load() {
      setMusicalEvent(undefined)
      setRsvps(null)
      setError(null)
      setConflict(null)
      try {
        const { nextEvent, nextSetlists, rsvpLoad } = await loadEventSurface(groupId!, eventId!)
        if (cancelled) return
        setMusicalEvent(nextEvent)
        setSetlists(nextSetlists)
        setSelectedSetlistId(nextSetlists[0]?.id ?? '')
        applyRsvpLoad(rsvpLoad)
      } catch (err) {
        if (cancelled) return
        setMusicalEvent(null)
        setSetlists([])
        setRsvps(null)
        setError(mutationErrorMessage(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, eventId, group])

  async function setOwnRsvp(response: EventRsvpResponse) {
    if (!groupId || !eventId) return
    setSavingRsvp(true)
    setError(null)
    try {
      await upsertEventRsvp(groupId, eventId, response)
      applyRsvpLoad(await loadEventRsvps(groupId, eventId))
    } catch (err) {
      setError(mutationErrorMessage(err))
    } finally {
      setSavingRsvp(false)
    }
  }

  async function apply(replaceConfirmed: boolean) {
    if (!groupId || !eventId || !musicalEvent || !selectedSetlistId) return
    setApplying(true)
    setError(null)
    setConflict(null)
    try {
      const updated = await applySetlistToEvent(groupId, eventId, {
        setlistId: selectedSetlistId,
        expectedVersion: musicalEvent.version,
        confirmReplace: replaceConfirmed,
      })
      setMusicalEvent(updated)
      setConfirmReplace(false)
      setTab('plan')
    } catch (err) {
      if (isConflictError(err) && hasPlan && !replaceConfirmed) {
        setConfirmReplace(true)
      } else if (isConflictError(err)) {
        setConflict(CONFLICT_MESSAGE)
        setConfirmReplace(false)
        try {
          await reload()
        } catch (reloadErr) {
          setError(mutationErrorMessage(reloadErr))
        }
      } else {
        setError(mutationErrorMessage(err))
        setConfirmReplace(false)
      }
    } finally {
      setApplying(false)
    }
  }

  function requestApply() {
    if (hasPlan) {
      setConfirmReplace(true)
      return
    }
    void apply(false)
  }

  async function handleCancelEvent() {
    if (!groupId || !eventId || !musicalEvent) return
    setCancelling(true)
    setError(null)
    setConflict(null)
    try {
      await cancelEvent(groupId, eventId, musicalEvent.version)
      setConfirmCancel(false)
      navigate(`/groups/${groupId}/events`)
    } catch (err) {
      if (isConflictError(err)) {
        setConflict(CONFLICT_MESSAGE)
        setConfirmCancel(false)
        try {
          await reload()
        } catch (reloadErr) {
          setError(mutationErrorMessage(reloadErr))
        }
      } else {
        setError(mutationErrorMessage(err))
        setConfirmCancel(false)
      }
    } finally {
      setCancelling(false)
    }
  }

  if (group === undefined) {
    return <p aria-live="polite">Cargando evento…</p>
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

  if (musicalEvent === undefined) {
    return <p aria-live="polite">Cargando evento…</p>
  }

  if (musicalEvent === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? 'No se encontró el evento o no tienes acceso.'} />
        <Link
          className="font-semibold text-primary no-underline hover:underline"
          to={`/groups/${group.id}/events`}
        >
          Eventos
        </Link>
      </div>
    )
  }

  const activeTab: DetailTab = editing ? 'details' : tab

  return (
    <section className="space-y-6" aria-labelledby="event-heading">
      <div className="space-y-3">
        <PageBreadcrumb
          items={[
            { to: `/groups/${group.id}`, label: group.name },
            { to: `/groups/${group.id}/events`, label: 'Eventos' },
            { label: musicalEvent.title },
          ]}
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
              aria-hidden="true"
            >
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <h1 id="event-heading" className="text-2xl font-bold tracking-tight">
                {musicalEvent.title}
              </h1>
              <p className="text-sm text-slate-500">
                {formatEventType(musicalEvent.type)} · {formatStartsAt(musicalEvent.startsAt)} ·{' '}
                {formatEventStatus(musicalEvent.status)} · v{musicalEvent.version}
                {!isOwner ? <span> · Solo lectura</span> : null}
              </p>
            </div>
          </div>
          {isOwner && isLive && !editing ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setTab('details')
                  setEditing(true)
                }}
              >
                Editar evento
              </Button>
              <Button variant="danger" onClick={() => setConfirmCancel(true)}>
                Cancelar evento
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <ProblemAlert message={error} />
      <ConflictAlert message={conflict} />

      <div
        className="flex gap-1 rounded-xl bg-neutral-light p-1"
        role="tablist"
        aria-label="Secciones del evento"
      >
        <TabButton
          selected={activeTab === 'plan'}
          onClick={() => {
            setEditing(false)
            setTab('plan')
          }}
        >
          Plan del evento
        </TabButton>
        <TabButton
          selected={activeTab === 'details'}
          onClick={() => setTab('details')}
        >
          Detalles
        </TabButton>
      </div>

      {activeTab === 'plan' ? (
        <section className="space-y-4" aria-labelledby="plan-heading">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="plan-heading" className="text-lg font-semibold">
                Plan del evento
              </h2>
              <span className="inline-flex items-center gap-1 rounded-lg bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Copia
              </span>
            </div>
            <p className="text-sm text-slate-500">
              Plan de canciones (copiado de la lista). Los cambios posteriores a la lista no
              actualizan este plan hasta que vuelvas a aplicar.
            </p>
          </div>

          {plan.length === 0 ? (
            <EmptyPanel
              title="Aún no hay plan"
              description={
                isOwner && isLive
                  ? 'Aplica una lista para copiar sus arreglos actuales a este evento.'
                  : 'Cuando haya un plan, las canciones aparecerán numeradas aquí.'
              }
            />
          ) : (
            <ol className="space-y-2">
              {plan.map((item, index) => (
                <li
                  key={item.id}
                  className="library-enter flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-3"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <PlanNumber n={item.sortOrder} />
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-neutral-dark"
                    aria-hidden="true"
                  >
                    <Music2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-neutral-dark">
                      {item.displaySongTitle}
                    </span>
                    <span className="text-sm text-slate-500">{item.displayArrangementLabel}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {isOwner && isLive ? (
            <section
              className="max-w-md space-y-3 rounded-2xl border border-slate-100 bg-neutral-light p-4"
              aria-labelledby="apply-heading"
            >
              <h3 id="apply-heading" className="font-semibold">
                Aplicar lista
              </h3>
              {setlists === null ? (
                <p aria-live="polite">Cargando listas…</p>
              ) : setlists.length === 0 ? (
                <p className="text-sm text-slate-500">Aún no hay listas. Crea una primero.</p>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault()
                    requestApply()
                  }}
                >
                  <Field label="Lista">
                    <select
                      className={fieldClass}
                      value={selectedSetlistId}
                      onChange={(e) => setSelectedSetlistId(e.target.value)}
                    >
                      {setlists.map((setlist) => (
                        <option key={setlist.id} value={setlist.id}>
                          {setlist.name} ({setlist.itemCount}{' '}
                          {setlist.itemCount === 1 ? 'canción' : 'canciones'})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button type="submit" disabled={applying || !selectedSetlistId}>
                    {applying ? 'Aplicando…' : 'Aplicar lista'}
                  </Button>
                </form>
              )}
            </section>
          ) : null}
        </section>
      ) : (
        <section className="space-y-4" aria-labelledby="details-heading">
          <h2 id="details-heading" className="sr-only">
            Detalles
          </h2>
          {editing && isOwner && isLive ? (
            <EventEditForm
              musicalEvent={musicalEvent}
              groupId={group.id}
              onCancel={() => setEditing(false)}
              onSaved={async (next) => {
                setMusicalEvent(next)
                setEditing(false)
                setConflict(null)
              }}
              onConflict={async () => {
                setConflict(CONFLICT_MESSAGE)
                setEditing(false)
                try {
                  await reload()
                } catch (err) {
                  setError(mutationErrorMessage(err))
                }
              }}
            />
          ) : (
            <dl className="grid max-w-lg gap-4 rounded-2xl bg-neutral-light p-5 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-slate-500">Tipo</dt>
                <dd className="font-medium text-neutral-dark">{formatEventType(musicalEvent.type)}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Fecha y hora</dt>
                <dd className="font-medium text-neutral-dark">
                  {formatStartsAt(musicalEvent.startsAt)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Estado</dt>
                <dd className="font-medium text-neutral-dark">
                  {formatEventStatus(musicalEvent.status)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Versión</dt>
                <dd className="font-medium text-neutral-dark">v{musicalEvent.version}</dd>
              </div>
            </dl>
          )}
        </section>
      )}

      {isLive ? (
        <section
          className="space-y-4 border-t border-slate-200 pt-6"
          aria-labelledby="attendance-heading"
        >
          <div className="space-y-1">
            <h2 id="attendance-heading" className="text-lg font-semibold">
              Asistencia
            </h2>
            <p className="text-sm text-slate-500">Indica si vas a este evento.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tu respuesta">
            {RSVP_CHOICES.map((choice) => {
              const selected = myResponse === choice.value
              return (
                <Button
                  key={choice.value}
                  variant={selected ? 'primary' : 'secondary'}
                  aria-pressed={selected}
                  disabled={savingRsvp}
                  onClick={() => void setOwnRsvp(choice.value)}
                >
                  {choice.label}
                </Button>
              )
            })}
          </div>
          {rsvps === null ? null : rsvps.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no hay respuestas.</p>
          ) : (
            <ul className="space-y-2">
              {rsvps.map((item) => (
                <li
                  key={item.userId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm"
                >
                  <span className="font-medium text-neutral-dark">{item.displayName}</span>
                  <span className="text-slate-500">{formatRsvpResponse(item.response)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmReplace}
        title="¿Reemplazar plan del evento?"
        confirmLabel="Reemplazar plan"
        cancelLabel="Cancelar"
        pendingLabel="Reemplazando…"
        pending={applying}
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => void apply(true)}
      >
        <p>
          Este evento ya tiene un plan. Aplicar una lista reemplaza la copia actual. No se puede
          deshacer desde esta pantalla.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmCancel}
        title="¿Cancelar evento?"
        confirmLabel="Cancelar evento"
        cancelLabel="Volver"
        pendingLabel="Cancelando…"
        pending={cancelling}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancelEvent()}
      >
        <p>
          Esto oculta el evento de la lista. El plan copiado y las respuestas de asistencia se
          conservan en el evento.
        </p>
      </ConfirmDialog>
    </section>
  )
}

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={cn(
        'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition duration-150',
        selected
          ? 'bg-white text-neutral-dark shadow-sm'
          : 'text-slate-500 hover:text-neutral-dark',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function EventEditForm({
  musicalEvent,
  groupId,
  onCancel,
  onSaved,
  onConflict,
}: {
  musicalEvent: EventDetail
  groupId: string
  onCancel: () => void
  onSaved: (next: EventDetail) => Promise<void>
  onConflict: () => Promise<void>
}) {
  const [title, setTitle] = useState(musicalEvent.title)
  const [type, setType] = useState<EventType>(musicalEvent.type as EventType)
  const [startsAt, setStartsAt] = useState(toDatetimeLocalValue(musicalEvent.startsAt))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

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
      const updated = await patchEvent(groupId, musicalEvent.id, {
        expectedVersion: musicalEvent.version,
        title: title.trim(),
        type,
        startsAt: fromDatetimeLocalValue(startsAt),
      })
      await onSaved(updated)
    } catch (err) {
      if (isConflictError(err)) {
        await onConflict()
      } else {
        setError(mutationErrorMessage(err))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="max-w-lg space-y-4" onSubmit={onSubmit} noValidate>
      <h3 className="text-lg font-semibold">Editar evento</h3>
      <p className="text-sm text-slate-500">Guardando cambios · {musicalEvent.version}</p>
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
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </FormActions>
    </form>
  )
}
