import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  applySetlistToEvent,
  getEvent,
  isConflictError,
  listSetlists,
  type CurrentUser,
  type EventDetail,
  type SetlistListItem,
} from '../api/client'
import {
  CONFLICT_MESSAGE,
  ConfirmDialog,
  ConflictAlert,
  fieldClass,
  isOwnerRole,
  mutationErrorMessage,
  primaryButtonClass,
  ProblemAlert,
  useGroupContext,
} from '../repertoire/ui'
import { formatEventType, formatStartsAt } from './datetime'
import { GroupSectionNav } from './GroupSectionNav'

export function EventDetailPage({ user }: { user: CurrentUser }) {
  const { groupId, eventId } = useParams()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [musicalEvent, setMusicalEvent] = useState<EventDetail | null | undefined>(undefined)
  const [setlists, setSetlists] = useState<SetlistListItem[] | null>(null)
  const [selectedSetlistId, setSelectedSetlistId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [applying, setApplying] = useState(false)

  const isOwner = isOwnerRole(group?.role)
  const plan = musicalEvent?.items ?? []
  const hasPlan = plan.length >= 1

  async function reload() {
    if (!groupId || !eventId) return
    const [nextEvent, nextSetlists] = await Promise.all([
      getEvent(groupId, eventId),
      listSetlists(groupId),
    ])
    setMusicalEvent(nextEvent)
    setSetlists(nextSetlists)
    if (!selectedSetlistId && nextSetlists[0]) {
      setSelectedSetlistId(nextSetlists[0].id)
    }
  }

  useEffect(() => {
    if (!groupId || !eventId || !group) return
    let cancelled = false
    async function load() {
      setMusicalEvent(undefined)
      setError(null)
      setConflict(null)
      try {
        const [nextEvent, nextSetlists] = await Promise.all([
          getEvent(groupId!, eventId!),
          listSetlists(groupId!),
        ])
        if (cancelled) return
        setMusicalEvent(nextEvent)
        setSetlists(nextSetlists)
        setSelectedSetlistId(nextSetlists[0]?.id ?? '')
      } catch (err) {
        if (cancelled) return
        setMusicalEvent(null)
        setSetlists([])
        setError(mutationErrorMessage(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, eventId, group])

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

      <section className="space-y-4 border-t border-slate-300 pt-6" aria-labelledby="plan-heading">
        <h3 id="plan-heading" className="font-medium">
          Event plan
        </h3>
        <p className="text-sm text-slate-600">
          This plan is a copy from apply time. Later setlist edits do not change it until you apply
          again.
        </p>

        {plan.length === 0 ? (
          <p>No plan yet.{isOwner ? ' Apply a setlist to copy its current arrangements.' : ''}</p>
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

      {isOwner ? (
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
    </section>
  )
}
