import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import {
  CONFLICT_MESSAGE,
  ConfirmDialog,
  ConflictAlert,
  dangerButtonClass,
  fieldClass,
  isOwnerRole,
  mutationErrorMessage,
  primaryButtonClass,
  ProblemAlert,
  secondaryButtonClass,
  useGroupContext,
} from '../repertoire/ui'
import { formatEventType, formatStartsAt, fromDatetimeLocalValue, toDatetimeLocalValue } from './datetime'
import { GroupSectionNav } from './GroupSectionNav'

const RSVP_CHOICES: { value: EventRsvpResponse; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'maybe', label: 'Maybe' },
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
    return <p aria-live="polite">Loading event…</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="underline" to="/">
          Back to my groups
        </Link>
      </div>
    )
  }

  if (musicalEvent === undefined) {
    return <p aria-live="polite">Loading event…</p>
  }

  if (musicalEvent === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? 'Event not found or you do not have access.'} />
        <Link className="underline" to={`/groups/${group.id}/events`}>
          Back to events
        </Link>
      </div>
    )
  }

  return (
    <section className="space-y-6" aria-labelledby="event-heading">
      <div className="space-y-2">
        <p className="text-sm text-slate-600">
          <Link className="underline" to={`/groups/${group.id}`}>
            {group.name}
          </Link>
          <span aria-hidden="true"> / </span>
          <Link className="underline" to={`/groups/${group.id}/events`}>
            Events
          </Link>
          <span aria-hidden="true"> / </span>
          Event
        </p>
        <h2 id="event-heading" className="text-xl font-medium">
          {musicalEvent.title}
        </h2>
        <p className="text-slate-600">
          Role: <strong>{group.role}</strong>
          {!isOwner ? <span> (read-only)</span> : null}
          <span className="mx-2" aria-hidden="true">
            ·
          </span>
          Version: <strong>{musicalEvent.version}</strong>
        </p>
        <GroupSectionNav groupId={group.id} />
      </div>

      <ProblemAlert message={error} />
      <ConflictAlert message={conflict} />

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
        <dl className="space-y-2">
          <div>
            <dt className="text-sm text-slate-600">Type</dt>
            <dd>{formatEventType(musicalEvent.type)}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Starts at</dt>
            <dd>{formatStartsAt(musicalEvent.startsAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Status</dt>
            <dd>{musicalEvent.status}</dd>
          </div>
        </dl>
      )}

      {isOwner && isLive && !editing ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={secondaryButtonClass} onClick={() => setEditing(true)}>
            Edit event
          </button>
          <button
            type="button"
            className={dangerButtonClass}
            onClick={() => setConfirmCancel(true)}
          >
            Cancel event
          </button>
        </div>
      ) : null}

      <section className="space-y-4 border-t border-slate-300 pt-6" aria-labelledby="plan-heading">
        <h3 id="plan-heading" className="font-medium">
          Event plan
        </h3>
        <p className="text-sm text-slate-600">
          This plan is a copy from apply time. Later setlist edits do not change it until you apply
          again.
        </p>

        {plan.length === 0 ? (
          <p>No plan yet.{isOwner && isLive ? ' Apply a setlist to copy its current arrangements.' : ''}</p>
        ) : (
          <ol className="space-y-2">
            {plan.map((item) => (
              <li key={item.id}>
                <span className="mr-2 text-sm text-slate-500">{item.sortOrder}.</span>
                {item.displaySongTitle} — {item.displayArrangementLabel}
              </li>
            ))}
          </ol>
        )}
      </section>

      {isLive ? (
        <section className="space-y-4 border-t border-slate-300 pt-6" aria-labelledby="attendance-heading">
          <h3 id="attendance-heading" className="font-medium">
            Attendance
          </h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Your response">
            {RSVP_CHOICES.map((choice) => {
              const selected = myResponse === choice.value
              return (
                <button
                  key={choice.value}
                  type="button"
                  className={selected ? primaryButtonClass : secondaryButtonClass}
                  aria-pressed={selected}
                  disabled={savingRsvp}
                  onClick={() => void setOwnRsvp(choice.value)}
                >
                  {choice.label}
                </button>
              )
            })}
          </div>
          {rsvps === null ? null : rsvps.length === 0 ? (
            <p>No responses yet.</p>
          ) : (
            <ul className="space-y-2">
              {rsvps.map((item) => (
                <li key={item.userId}>
                  {item.displayName} — {formatRsvpResponse(item.response)}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {isOwner && isLive ? (
        <section className="space-y-3 border-t border-slate-300 pt-6" aria-labelledby="apply-heading">
          <h3 id="apply-heading" className="font-medium">
            Apply setlist
          </h3>
          {setlists === null ? (
            <p aria-live="polite">Loading setlists…</p>
          ) : setlists.length === 0 ? (
            <p>No setlists yet. Create one first.</p>
          ) : (
            <form
              className="max-w-md space-y-3"
              onSubmit={(event: FormEvent) => {
                event.preventDefault()
                requestApply()
              }}
            >
              <label className="block space-y-1">
                <span className="text-sm text-slate-700">Setlist</span>
                <select
                  className={fieldClass}
                  value={selectedSetlistId}
                  onChange={(e) => setSelectedSetlistId(e.target.value)}
                >
                  {setlists.map((setlist) => (
                    <option key={setlist.id} value={setlist.id}>
                      {setlist.name} ({setlist.itemCount}{' '}
                      {setlist.itemCount === 1 ? 'item' : 'items'})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className={primaryButtonClass}
                disabled={applying || !selectedSetlistId}
              >
                {applying ? 'Applying…' : 'Apply setlist'}
              </button>
            </form>
          )}
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmReplace}
        title="Replace event plan?"
        confirmLabel="Replace plan"
        pending={applying}
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => void apply(true)}
      >
        <p>
          This event already has a plan. Applying a setlist replaces the copied plan. This cannot be
          undone from this screen.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmCancel}
        title="Cancel event?"
        confirmLabel="Cancel event"
        pending={cancelling}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancelEvent()}
      >
        <p>
          This hides the event from the default list. The copied plan and attendance responses stay
          on the event.
        </p>
      </ConfirmDialog>
    </section>
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
      setError('Starts at is required.')
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
    <form className="max-w-md space-y-3" onSubmit={onSubmit} noValidate>
      <h3 className="font-medium">Edit event</h3>
      <p className="text-sm text-slate-600">Editing version {musicalEvent.version}</p>
      <ProblemAlert message={error} />
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Title</span>
        <input
          className={fieldClass}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Type</span>
        <select
          className={fieldClass}
          required
          value={type}
          onChange={(e) => setType(e.target.value as EventType)}
        >
          <option value="rehearsal">Rehearsal</option>
          <option value="performance">Performance</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Starts at</span>
        <input
          className={fieldClass}
          type="datetime-local"
          required
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
