import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createSetlist,
  listSetlists,
  type CurrentUser,
  type SetlistListItem,
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
import { GroupSectionNav } from './GroupSectionNav'

export function SetlistListPage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [setlists, setSetlists] = useState<SetlistListItem[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const isOwner = isOwnerRole(group?.role)

  async function reload() {
    if (!groupId) return
    setListError(null)
    try {
      setSetlists(await listSetlists(groupId))
    } catch (err) {
      setSetlists([])
      setListError(mutationErrorMessage(err))
    }
  }

  useEffect(() => {
    if (!groupId || !group) return
    let cancelled = false
    async function load() {
      setSetlists(null)
      setListError(null)
      try {
        const result = await listSetlists(groupId!)
        if (!cancelled) setSetlists(result)
      } catch (err) {
        if (cancelled) return
        setSetlists([])
        setListError(mutationErrorMessage(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, group])

  if (group === undefined) {
    return <p aria-live="polite">Loading setlists…</p>
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
    <section className="space-y-6" aria-labelledby="setlists-heading">
      <div className="space-y-2">
        <p className="text-sm text-slate-600">
          <Link className="underline" to={`/groups/${group.id}`}>
            {group.name}
          </Link>
          <span aria-hidden="true"> / </span>
          Setlists
        </p>
        <h2 id="setlists-heading" className="text-xl font-medium">
          Setlists
        </h2>
        <p className="text-slate-600">
          Role: <strong>{group.role}</strong>
          {!isOwner ? <span> (read-only)</span> : null}
        </p>
        <GroupSectionNav groupId={group.id} />
      </div>

      <ProblemAlert message={listError} />

      {setlists === null ? (
        <p aria-live="polite">Loading setlists…</p>
      ) : setlists.length === 0 ? (
        <p>No setlists yet.{isOwner ? ' Create one from live arrangements.' : ''}</p>
      ) : (
        <ul className="space-y-3">
          {setlists.map((setlist) => (
            <li key={setlist.id} className="border-b border-slate-200 pb-3">
              <Link
                className="text-lg font-medium underline"
                to={`/groups/${group.id}/setlists/${setlist.id}`}
              >
                {setlist.name}
              </Link>
              <p className="text-sm text-slate-600">
                {setlist.itemCount} {setlist.itemCount === 1 ? 'item' : 'items'}
              </p>
            </li>
          ))}
        </ul>
      )}

      {isOwner ? (
        showCreate ? (
          <SetlistCreateForm
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
            Add setlist
          </button>
        )
      ) : null}
    </section>
  )
}

function SetlistCreateForm({
  groupId,
  onCreated,
  onCancel,
}: {
  groupId: string
  onCreated: () => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const created = await createSetlist(groupId, name.trim())
      await onCreated()
      navigate(`/groups/${groupId}/setlists/${created.id}`)
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
      <h3 className="font-medium">Create setlist</h3>
      <ProblemAlert message={error} />
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Name</span>
        <input
          className={fieldClass}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? 'Creating…' : 'Create setlist'}
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
