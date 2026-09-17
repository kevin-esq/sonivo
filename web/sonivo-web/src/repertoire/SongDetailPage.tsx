import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createArrangement,
  deleteSong,
  getSong,
  isConflictError,
  listArrangements,
  updateSong,
  type ArrangementListItem,
  type CurrentUser,
  type SongDetail,
  type SongOriginKind,
} from '../api/client'
import {
  CONFLICT_MESSAGE,
  ConfirmDialog,
  ConflictAlert,
  fieldClass,
  formatOriginKind,
  isOwnerRole,
  mutationErrorMessage,
  primaryButtonClass,
  ProblemAlert,
  secondaryButtonClass,
  dangerButtonClass,
  useGroupContext,
} from './ui'

export function SongDetailPage({ user }: { user: CurrentUser }) {
  const { groupId, songId } = useParams()
  const navigate = useNavigate()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [song, setSong] = useState<SongDetail | null | undefined>(undefined)
  const [arrangements, setArrangements] = useState<ArrangementListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [creatingArrangement, setCreatingArrangement] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isOwner = isOwnerRole(group?.role)

  async function reloadSongAndArrangements() {
    if (!groupId || !songId) return
    const [nextSong, nextArrangements] = await Promise.all([
      getSong(groupId, songId),
      listArrangements(groupId, songId),
    ])
    setSong(nextSong)
    setArrangements(nextArrangements)
  }

  useEffect(() => {
    if (!groupId || !songId || !group) return
    let cancelled = false
    async function load() {
      setSong(undefined)
      setArrangements(null)
      setError(null)
      setConflict(null)
      try {
        const [nextSong, nextArrangements] = await Promise.all([
          getSong(groupId!, songId!),
          listArrangements(groupId!, songId!),
        ])
        if (cancelled) return
        setSong(nextSong)
        setArrangements(nextArrangements)
      } catch (err) {
        if (cancelled) return
        setSong(null)
        setArrangements([])
        setError(mutationErrorMessage(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, songId, group])

  async function handleDelete() {
    if (!groupId || !songId || !song) return
    setDeleting(true)
    setError(null)
    setConflict(null)
    try {
      await deleteSong(groupId, songId, song.version)
      setConfirmDelete(false)
      navigate(`/groups/${groupId}/library`)
    } catch (err) {
      if (isConflictError(err)) {
        setConflict(CONFLICT_MESSAGE)
        setConfirmDelete(false)
        try {
          await reloadSongAndArrangements()
        } catch (reloadErr) {
          setError(mutationErrorMessage(reloadErr))
        }
      } else {
        setError(mutationErrorMessage(err))
        setConfirmDelete(false)
      }
    } finally {
      setDeleting(false)
    }
  }

  if (group === undefined) {
    return <p aria-live="polite">Loading song…</p>
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

  if (song === undefined) {
    return <p aria-live="polite">Loading song…</p>
  }

  if (song === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? 'Song not found or you do not have access.'} />
        <Link className="underline" to={`/groups/${group.id}/library`}>
          Back to library
        </Link>
      </div>
    )
  }

  return (
    <section className="space-y-6" aria-labelledby="song-heading">
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
          Song
        </p>
        <h2 id="song-heading" className="text-xl font-medium">
          {song.title}
        </h2>
        <p className="text-slate-600">
          Role: <strong>{group.role}</strong>
          {!isOwner ? <span> (read-only)</span> : null}
          <span className="mx-2" aria-hidden="true">
            ·
          </span>
          Version: <strong>{song.version}</strong>
        </p>
      </div>

      <ProblemAlert message={error} />
      <ConflictAlert message={conflict} />

      {editing && isOwner ? (
        <SongEditForm
          song={song}
          groupId={group.id}
          onCancel={() => setEditing(false)}
          onSaved={async (next) => {
            setSong(next)
            setEditing(false)
            setConflict(null)
            setArrangements(await listArrangements(group.id, next.id))
          }}
          onConflict={async () => {
            setConflict(CONFLICT_MESSAGE)
            setEditing(false)
            try {
              await reloadSongAndArrangements()
            } catch (err) {
              setError(mutationErrorMessage(err))
            }
          }}
        />
      ) : (
        <dl className="space-y-2">
          <div>
            <dt className="text-sm text-slate-600">Origin</dt>
            <dd>{formatOriginKind(song.originKind)}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Attribution</dt>
            <dd>{song.attribution ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Rights notes</dt>
            <dd className="whitespace-pre-wrap">{song.rightsNotes ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Arrangements</dt>
            <dd>{song.arrangementCount}</dd>
          </div>
        </dl>
      )}

      {isOwner && !editing ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={secondaryButtonClass} onClick={() => setEditing(true)}>
            Edit song
          </button>
          <button
            type="button"
            className={dangerButtonClass}
            onClick={() => setConfirmDelete(true)}
          >
            Delete song
          </button>
        </div>
      ) : null}

      <section className="space-y-4 border-t border-slate-300 pt-6" aria-labelledby="arrangements-heading">
        <h3 id="arrangements-heading" className="font-medium">
          Arrangements
        </h3>

        {arrangements === null ? (
          <p aria-live="polite">Loading arrangements…</p>
        ) : arrangements.length === 0 ? (
          <p>No arrangements yet. A song can exist without arrangements.</p>
        ) : (
          <ul className="space-y-2">
            {arrangements.map((arrangement) => (
              <li key={arrangement.id}>
                <Link
                  className="underline"
                  to={`/groups/${group.id}/arrangements/${arrangement.id}`}
                >
                  {arrangement.label}
                </Link>
                <span className="ml-2 text-sm text-slate-600">
                  {arrangement.defaultKey ? `${arrangement.defaultKey}` : ''}
                  {arrangement.defaultBpm != null
                    ? `${arrangement.defaultKey ? ' · ' : ''}${arrangement.defaultBpm} BPM`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}

        {isOwner ? (
          creatingArrangement ? (
            <ArrangementCreateForm
              groupId={group.id}
              songId={song.id}
              onCancel={() => setCreatingArrangement(false)}
              onCreated={async (createdId) => {
                setCreatingArrangement(false)
                navigate(`/groups/${group.id}/arrangements/${createdId}`)
              }}
            />
          ) : (
            <button
              type="button"
              className={primaryButtonClass}
              onClick={() => setCreatingArrangement(true)}
            >
              Add arrangement
            </button>
          )
        ) : null}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete song?"
        confirmLabel="Delete song"
        pending={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
      >
        <p>
          This removes the song and its live arrangements from normal views. Linked resources are
          preserved by the server.
        </p>
      </ConfirmDialog>
    </section>
  )
}

function SongEditForm({
  song,
  groupId,
  onCancel,
  onSaved,
  onConflict,
}: {
  song: SongDetail
  groupId: string
  onCancel: () => void
  onSaved: (song: SongDetail) => Promise<void>
  onConflict: () => Promise<void>
}) {
  const [title, setTitle] = useState(song.title)
  const [originKind, setOriginKind] = useState<SongOriginKind>(
    song.originKind as SongOriginKind,
  )
  const [attribution, setAttribution] = useState(song.attribution ?? '')
  const [rightsNotes, setRightsNotes] = useState(song.rightsNotes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const updated = await updateSong(groupId, song.id, {
        expectedVersion: song.version,
        title: title.trim(),
        originKind,
        attribution,
        rightsNotes,
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
      <h3 className="font-medium">Edit song</h3>
      <p className="text-sm text-slate-600">Editing version {song.version}</p>
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
        <span className="text-sm text-slate-700">Origin</span>
        <select
          className={fieldClass}
          required
          value={originKind}
          onChange={(e) => setOriginKind(e.target.value as SongOriginKind)}
        >
          <option value="original">Original</option>
          <option value="cover">Cover</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Attribution (optional)</span>
        <input
          className={fieldClass}
          value={attribution}
          onChange={(e) => setAttribution(e.target.value)}
          maxLength={500}
        />
        <span className="text-xs text-slate-500">Clear the field to remove attribution.</span>
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Rights notes (optional)</span>
        <textarea
          className={fieldClass}
          rows={3}
          value={rightsNotes}
          onChange={(e) => setRightsNotes(e.target.value)}
          maxLength={2000}
        />
        <span className="text-xs text-slate-500">Clear the field to remove rights notes.</span>
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

function ArrangementCreateForm({
  groupId,
  songId,
  onCreated,
  onCancel,
}: {
  groupId: string
  songId: string
  onCreated: (arrangementId: string) => Promise<void>
  onCancel: () => void
}) {
  const [label, setLabel] = useState('')
  const [defaultKey, setDefaultKey] = useState('')
  const [defaultBpm, setDefaultBpm] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [chords, setChords] = useState('')
  const [structure, setStructure] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    let bpm: number | null = null
    if (defaultBpm.trim()) {
      const parsed = Number(defaultBpm)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 400) {
        setError('Default BPM must be an integer from 1 to 400.')
        setPending(false)
        return
      }
      bpm = parsed
    }

    try {
      const created = await createArrangement(groupId, songId, {
        label: label.trim(),
        defaultKey: defaultKey.trim() || null,
        defaultBpm: bpm,
        lyrics: lyrics.trim() || null,
        chords: chords.trim() || null,
        structure: structure.trim() || null,
        notes: notes.trim() || null,
      })
      await onCreated(created.id)
    } catch (err) {
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="max-w-md space-y-3 border-t border-slate-200 pt-4" onSubmit={onSubmit} noValidate>
      <h4 className="font-medium">Create arrangement</h4>
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
          {pending ? 'Creating…' : 'Create arrangement'}
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
