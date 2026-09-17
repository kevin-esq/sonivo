import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createLinkResource,
  deleteArrangement,
  deleteResource,
  getArrangement,
  isConflictError,
  updateArrangement,
  updateLinkResource,
  type ArrangementDetail,
  type CurrentUser,
  type ResourcePurpose,
  type ResourceSummary,
} from '../api/client'
import {
  CONFLICT_MESSAGE,
  ConfirmDialog,
  ConflictAlert,
  dangerButtonClass,
  fieldClass,
  formatPurpose,
  isOwnerRole,
  mutationErrorMessage,
  primaryButtonClass,
  ProblemAlert,
  secondaryButtonClass,
  useGroupContext,
} from './ui'

const RESOURCE_PURPOSES: ResourcePurpose[] = [
  'chart',
  'lyrics',
  'audio',
  'click',
  'reference',
  'practice',
  'other',
]

export function ArrangementDetailPage({ user }: { user: CurrentUser }) {
  const { groupId, arrangementId } = useParams()
  const navigate = useNavigate()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [arrangement, setArrangement] = useState<ArrangementDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [creatingResource, setCreatingResource] = useState(false)
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null)
  const [confirmDeleteArrangement, setConfirmDeleteArrangement] = useState(false)
  const [deletingArrangement, setDeletingArrangement] = useState(false)
  const [resourceToDelete, setResourceToDelete] = useState<ResourceSummary | null>(null)
  const [deletingResource, setDeletingResource] = useState(false)

  const isOwner = isOwnerRole(group?.role)

  async function reloadArrangement() {
    if (!groupId || !arrangementId) return
    setArrangement(await getArrangement(groupId, arrangementId))
  }

  useEffect(() => {
    if (!groupId || !arrangementId || !group) return
    let cancelled = false
    async function load() {
      setArrangement(undefined)
      setError(null)
      setConflict(null)
      try {
        const result = await getArrangement(groupId!, arrangementId!)
        if (!cancelled) setArrangement(result)
      } catch (err) {
        if (cancelled) return
        setArrangement(null)
        setError(mutationErrorMessage(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, arrangementId, group])

  async function handleDeleteArrangement() {
    if (!groupId || !arrangementId || !arrangement) return
    setDeletingArrangement(true)
    setError(null)
    setConflict(null)
    try {
      await deleteArrangement(groupId, arrangementId, arrangement.version)
      setConfirmDeleteArrangement(false)
      navigate(`/groups/${groupId}/songs/${arrangement.songId}`)
    } catch (err) {
      if (isConflictError(err)) {
        setConflict(CONFLICT_MESSAGE)
        setConfirmDeleteArrangement(false)
        try {
          await reloadArrangement()
        } catch (reloadErr) {
          setError(mutationErrorMessage(reloadErr))
        }
      } else {
        setError(mutationErrorMessage(err))
        setConfirmDeleteArrangement(false)
      }
    } finally {
      setDeletingArrangement(false)
    }
  }

  async function handleDeleteResource() {
    if (!groupId || !arrangementId || !resourceToDelete) return
    setDeletingResource(true)
    setError(null)
    try {
      await deleteResource(groupId, arrangementId, resourceToDelete.id)
      setResourceToDelete(null)
      await reloadArrangement()
    } catch (err) {
      setError(mutationErrorMessage(err))
      setResourceToDelete(null)
    } finally {
      setDeletingResource(false)
    }
  }

  if (group === undefined) {
    return <p aria-live="polite">Loading arrangement…</p>
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

  if (arrangement === undefined) {
    return <p aria-live="polite">Loading arrangement…</p>
  }

  if (arrangement === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? 'Arrangement not found or you do not have access.'} />
        <Link className="underline" to={`/groups/${group.id}/library`}>
          Back to library
        </Link>
      </div>
    )
  }

  return (
    <section className="space-y-6" aria-labelledby="arrangement-heading">
      <div className="space-y-2">
        <p className="text-sm text-slate-600">
          <Link className="underline" to={`/groups/${group.id}`}>
            {group.name}
          </Link>
          <span aria-hidden="true"> / </span>
          <Link className="underline" to={`/groups/${group.id}/library`}>
            Library
          </Link>
          <span aria-hidden="true"> / </span>
          <Link className="underline" to={`/groups/${group.id}/songs/${arrangement.songId}`}>
            Song
          </Link>
          <span aria-hidden="true"> / </span>
          Arrangement
        </p>
        <h2 id="arrangement-heading" className="text-xl font-medium">
          {arrangement.label}
        </h2>
        <p className="text-slate-600">
          Role: <strong>{group.role}</strong>
          {!isOwner ? <span> (read-only)</span> : null}
          <span className="mx-2" aria-hidden="true">
            ·
          </span>
          Version: <strong>{arrangement.version}</strong>
        </p>
      </div>

      <ProblemAlert message={error} />
      <ConflictAlert message={conflict} />

      {editing && isOwner ? (
        <ArrangementEditForm
          arrangement={arrangement}
          groupId={group.id}
          onCancel={() => setEditing(false)}
          onSaved={async (next) => {
            setArrangement(next)
            setEditing(false)
            setConflict(null)
          }}
          onConflict={async () => {
            setConflict(CONFLICT_MESSAGE)
            setEditing(false)
            try {
              await reloadArrangement()
            } catch (err) {
              setError(mutationErrorMessage(err))
            }
          }}
        />
      ) : (
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-slate-600">Default key</dt>
            <dd>{arrangement.defaultKey ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Default BPM</dt>
            <dd>{arrangement.defaultBpm ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Lyrics</dt>
            <dd className="whitespace-pre-wrap">{arrangement.lyrics ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Chords</dt>
            <dd className="whitespace-pre-wrap">{arrangement.chords ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Structure</dt>
            <dd className="whitespace-pre-wrap">{arrangement.structure ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Notes</dt>
            <dd className="whitespace-pre-wrap">{arrangement.notes ?? '—'}</dd>
          </div>
        </dl>
      )}

      {isOwner && !editing ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={secondaryButtonClass} onClick={() => setEditing(true)}>
            Edit arrangement
          </button>
          <button
            type="button"
            className={dangerButtonClass}
            onClick={() => setConfirmDeleteArrangement(true)}
          >
            Delete arrangement
          </button>
        </div>
      ) : null}

      <section className="space-y-4 border-t border-slate-300 pt-6" aria-labelledby="resources-heading">
        <h3 id="resources-heading" className="font-medium">
          Link resources
        </h3>

        {arrangement.resources.length === 0 ? (
          <p>No link resources yet.</p>
        ) : (
          <ul className="space-y-4">
            {arrangement.resources.map((resource) => (
              <li key={resource.id} className="border-b border-slate-200 pb-4">
                {editingResourceId === resource.id && isOwner ? (
                  <ResourceEditForm
                    groupId={group.id}
                    arrangementId={arrangement.id}
                    resource={resource}
                    onCancel={() => setEditingResourceId(null)}
                    onSaved={async () => {
                      setEditingResourceId(null)
                      await reloadArrangement()
                    }}
                  />
                ) : (
                  <ResourceRow
                    resource={resource}
                    isOwner={isOwner}
                    onEdit={() => setEditingResourceId(resource.id)}
                    onDelete={() => setResourceToDelete(resource)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {isOwner ? (
          creatingResource ? (
            <ResourceCreateForm
              groupId={group.id}
              arrangementId={arrangement.id}
              onCancel={() => setCreatingResource(false)}
              onCreated={async () => {
                setCreatingResource(false)
                await reloadArrangement()
              }}
            />
          ) : (
            <button
              type="button"
              className={primaryButtonClass}
              onClick={() => setCreatingResource(true)}
            >
              Add link resource
            </button>
          )
        ) : null}
      </section>

      <ConfirmDialog
        open={confirmDeleteArrangement}
        title="Delete arrangement?"
        confirmLabel="Delete arrangement"
        pending={deletingArrangement}
        onCancel={() => setConfirmDeleteArrangement(false)}
        onConfirm={() => void handleDeleteArrangement()}
      >
        <p>
          This removes the arrangement from normal live views. Linked resources are preserved by the
          server.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={resourceToDelete != null}
        title="Delete link resource?"
        confirmLabel="Delete resource"
        pending={deletingResource}
        onCancel={() => setResourceToDelete(null)}
        onConfirm={() => void handleDeleteResource()}
      >
        <p>
          This permanently deletes the link resource
          {resourceToDelete ? ` “${resourceToDelete.label}”` : ''}. This cannot be undone.
        </p>
      </ConfirmDialog>
    </section>
  )
}

function ResourceRow({
  resource,
  isOwner,
  onEdit,
  onDelete,
}: {
  resource: ResourceSummary
  isOwner: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-2">
      <p className="font-medium">{resource.label}</p>
      <p className="text-sm text-slate-600">
        {formatPurpose(resource.purpose)}
        {resource.part ? ` · Part: ${resource.part}` : ''}
      </p>
      {resource.note ? <p className="text-sm text-slate-700">{resource.note}</p> : null}
      {resource.url ? (
        <p>
          <a
            className="underline break-all"
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {resource.url}
          </a>
        </p>
      ) : null}
      {isOwner ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={secondaryButtonClass} onClick={onEdit}>
            Edit metadata
          </button>
          <button type="button" className={dangerButtonClass} onClick={onDelete}>
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}

function ArrangementEditForm({
  arrangement,
  groupId,
  onCancel,
  onSaved,
  onConflict,
}: {
  arrangement: ArrangementDetail
  groupId: string
  onCancel: () => void
  onSaved: (arrangement: ArrangementDetail) => Promise<void>
  onConflict: () => Promise<void>
}) {
  const [label, setLabel] = useState(arrangement.label)
  const [defaultKey, setDefaultKey] = useState(arrangement.defaultKey ?? '')
  const [defaultBpm, setDefaultBpm] = useState(
    arrangement.defaultBpm != null ? String(arrangement.defaultBpm) : '',
  )
  const [lyrics, setLyrics] = useState(arrangement.lyrics ?? '')
  const [chords, setChords] = useState(arrangement.chords ?? '')
  const [structure, setStructure] = useState(arrangement.structure ?? '')
  const [notes, setNotes] = useState(arrangement.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const payload: Parameters<typeof updateArrangement>[2] = {
      expectedVersion: arrangement.version,
      label: label.trim(),
      defaultKey,
      lyrics,
      chords,
      structure,
      notes,
    }

    // Empty BPM field: omit so existing BPM is preserved (cannot clear via null).
    if (defaultBpm.trim()) {
      const parsed = Number(defaultBpm)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 400) {
        setError('Default BPM must be an integer from 1 to 400.')
        setPending(false)
        return
      }
      payload.defaultBpm = parsed
    }

    try {
      const updated = await updateArrangement(groupId, arrangement.id, payload)
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
      <h3 className="font-medium">Edit arrangement</h3>
      <p className="text-sm text-slate-600">Editing version {arrangement.version}</p>
      <ProblemAlert message={error} />
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Label</span>
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Default key (optional)</span>
        <input
          className={fieldClass}
          value={defaultKey}
          onChange={(e) => setDefaultKey(e.target.value)}
          maxLength={32}
        />
        <span className="text-xs text-slate-500">Clear the field to remove the default key.</span>
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Default BPM (optional, 1–400)</span>
        <input
          className={fieldClass}
          type="number"
          min={1}
          max={400}
          inputMode="numeric"
          value={defaultBpm}
          onChange={(e) => setDefaultBpm(e.target.value)}
        />
        <span className="text-xs text-slate-500">
          Leave blank to keep the current BPM. Clearing BPM is not supported by the API.
        </span>
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Lyrics (optional)</span>
        <textarea className={fieldClass} rows={3} value={lyrics} onChange={(e) => setLyrics(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Chords (optional)</span>
        <textarea className={fieldClass} rows={3} value={chords} onChange={(e) => setChords(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Structure (optional)</span>
        <textarea
          className={fieldClass}
          rows={2}
          value={structure}
          onChange={(e) => setStructure(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Notes (optional)</span>
        <textarea className={fieldClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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

function ResourceCreateForm({
  groupId,
  arrangementId,
  onCreated,
  onCancel,
}: {
  groupId: string
  arrangementId: string
  onCreated: () => Promise<void>
  onCancel: () => void
}) {
  const [purpose, setPurpose] = useState<ResourcePurpose>('practice')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [part, setPart] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await createLinkResource(groupId, arrangementId, {
        purpose,
        label: label.trim(),
        url: url.trim(),
        part: part.trim() || null,
        note: note.trim() || null,
      })
      await onCreated()
    } catch (err) {
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="max-w-md space-y-3 border-t border-slate-200 pt-4" onSubmit={onSubmit} noValidate>
      <h4 className="font-medium">Add link resource</h4>
      <ProblemAlert message={error} />
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Purpose</span>
        <select
          className={fieldClass}
          required
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as ResourcePurpose)}
        >
          {RESOURCE_PURPOSES.map((value) => (
            <option key={value} value={value}>
              {formatPurpose(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Label</span>
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">URL</span>
        <input
          className={fieldClass}
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Part (optional)</span>
        <input className={fieldClass} value={part} onChange={(e) => setPart(e.target.value)} maxLength={100} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Note (optional)</span>
        <textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? 'Creating…' : 'Create link'}
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

function ResourceEditForm({
  groupId,
  arrangementId,
  resource,
  onCancel,
  onSaved,
}: {
  groupId: string
  arrangementId: string
  resource: ResourceSummary
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const [purpose, setPurpose] = useState<ResourcePurpose>(
    (RESOURCE_PURPOSES.includes(resource.purpose as ResourcePurpose)
      ? resource.purpose
      : 'other') as ResourcePurpose,
  )
  const [label, setLabel] = useState(resource.label)
  const [part, setPart] = useState(resource.part ?? '')
  const [note, setNote] = useState(resource.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await updateLinkResource(groupId, arrangementId, resource.id, {
        purpose,
        label: label.trim(),
        part,
        note,
      })
      await onSaved()
    } catch (err) {
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="max-w-md space-y-3" onSubmit={onSubmit} noValidate>
      <h4 className="font-medium">Edit resource metadata</h4>
      {resource.url ? (
        <p className="text-sm text-slate-600">
          URL (immutable):{' '}
          <a
            className="underline break-all"
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {resource.url}
          </a>
        </p>
      ) : null}
      <ProblemAlert message={error} />
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Purpose</span>
        <select
          className={fieldClass}
          required
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as ResourcePurpose)}
        >
          {RESOURCE_PURPOSES.map((value) => (
            <option key={value} value={value}>
              {formatPurpose(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Label</span>
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Part (optional)</span>
        <input className={fieldClass} value={part} onChange={(e) => setPart(e.target.value)} maxLength={100} />
        <span className="text-xs text-slate-500">Clear the field to remove part.</span>
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Note (optional)</span>
        <textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <span className="text-xs text-slate-500">Clear the field to remove note.</span>
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? 'Saving…' : 'Save metadata'}
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
