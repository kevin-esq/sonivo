import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createEvent,
  listEvents,
  type CurrentUser,
  type EventListItem,
  type EventType,
} from '../api/client'
import {
  fieldClass,
  isOwnerRole,
  mutationErrorMessage,
  primaryButtonClass,
  ProblemAlert,
  secondaryButtonClass,
  useGroupContext,
} from '../repertoire/ui'
import { formatEventType, formatStartsAt, fromDatetimeLocalValue } from './datetime'
import { GroupSectionNav } from './GroupSectionNav'

export function EventListPage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [events, setEvents] = useState<EventListItem[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const isOwner = isOwnerRole(group?.role)

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
    return <p aria-live="polite">Loading events…</p>
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

  return (
    <section className="space-y-6" aria-labelledby="events-heading">
      <div className="space-y-2">
        <p className="text-sm text-slate-600">
          <Link className="underline" to={`/groups/${group.id}`}>
            {group.name}
          </Link>
          <span aria-hidden="true"> / </span>
          Events
        </p>
        <h2 id="events-heading" className="text-xl font-medium">
          Events
        </h2>
        <p className="text-slate-600">
          Role: <strong>{group.role}</strong>
          {!isOwner ? <span> (read-only)</span> : null}
        </p>
        <GroupSectionNav groupId={group.id} />
      </div>

      <ProblemAlert message={listError} />

      {events === null ? (
        <p aria-live="polite">Loading events…</p>
      ) : events.length === 0 ? (
        <p>No events yet.{isOwner ? ' Create a rehearsal or performance.' : ''}</p>
      ) : (
        <ul className="space-y-3">
          {events.map((musicalEvent) => (
            <li key={musicalEvent.id} className="border-b border-slate-200 pb-3">
              <Link
                className="text-lg font-medium underline"
                to={`/groups/${group.id}/events/${musicalEvent.id}`}
              >
                {musicalEvent.title}
              </Link>
              <p className="text-sm text-slate-600">
                {formatEventType(musicalEvent.type)} · {formatStartsAt(musicalEvent.startsAt)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {isOwner ? (
        showCreate ? (
          <EventCreateForm
            groupId={group.id}
            onCancel={() => setShowCreate(false)}
            onCreated={async () => {
              setShowCreate(false)
              await reload()
            }}
          />
        ) : (
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => setShowCreate(true)}
          >
            Add event
          </button>
        )
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
      setError('Starts at is required.')
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
    <form
      className="max-w-md space-y-3 border-t border-slate-300 pt-6"
      onSubmit={onSubmit}
      noValidate
    >
      <h3 className="font-medium">Create event</h3>
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
          {pending ? 'Creating…' : 'Create event'}
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
