import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  createSong,
  listSongs,
  type CurrentUser,
  type SongListItem,
  type SongOriginKind,
} from '../api/client'
import {
  fieldClass,
  formatOriginKind,
  isOwnerRole,
  mutationErrorMessage,
  primaryButtonClass,
  ProblemAlert,
  secondaryButtonClass,
  useGroupContext,
} from './ui'

export function LibraryPage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [songs, setSongs] = useState<SongListItem[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const isOwner = isOwnerRole(group?.role)

  async function reloadSongs() {
    if (!groupId) return
    setListError(null)
    try {
      setSongs(await listSongs(groupId))
    } catch (err) {
      setSongs([])
      setListError(mutationErrorMessage(err))
    }
  }

  useEffect(() => {
    if (!groupId || !group) return
    let cancelled = false
    async function load() {
      setSongs(null)
      setListError(null)
      try {
        const result = await listSongs(groupId!)
        if (!cancelled) setSongs(result)
      } catch (err) {
        if (cancelled) return
        setSongs([])
        setListError(mutationErrorMessage(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, group])

  if (group === undefined) {
    return <p aria-live="polite">Loading library…</p>
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
    <section className="space-y-6" aria-labelledby="library-heading">
      <div className="space-y-2">
        <p className="text-sm text-slate-600">
          <Link className="underline" to={`/groups/${group.id}`}>
            {group.name}
          </Link>
          <span aria-hidden="true"> / </span>
          Library
        </p>
        <h2 id="library-heading" className="text-xl font-medium">
          Song library
        </h2>
        <p className="text-slate-600">
          Role: <strong>{group.role}</strong>
          {!isOwner ? <span> (read-only)</span> : null}
        </p>
      </div>

      <ProblemAlert message={listError} />

      {songs === null ? (
        <p aria-live="polite">Loading songs…</p>
      ) : songs.length === 0 ? (
        <p>No songs yet.{isOwner ? ' Create one to start the repertoire.' : ''}</p>
      ) : (
        <ul className="space-y-3">
          {songs.map((song) => (
            <li key={song.id} className="border-b border-slate-200 pb-3">
              <Link
                className="text-lg font-medium underline"
                to={`/groups/${group.id}/songs/${song.id}`}
              >
                {song.title}
              </Link>
              <p className="text-sm text-slate-600">
                {formatOriginKind(song.originKind)}
                {song.attribution ? ` · ${song.attribution}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      {isOwner ? (
        showCreate ? (
          <SongCreateForm
            groupId={group.id}
            onCancel={() => setShowCreate(false)}
            onCreated={async () => {
              setShowCreate(false)
              await reloadSongs()
            }}
          />
        ) : (
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => setShowCreate(true)}
          >
            Add song
          </button>
        )
      ) : null}
    </section>
  )
}

function SongCreateForm({
  groupId,
  onCreated,
  onCancel,
}: {
  groupId: string
  onCreated: () => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [originKind, setOriginKind] = useState<SongOriginKind>('original')
  const [attribution, setAttribution] = useState('')
  const [rightsNotes, setRightsNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await createSong(groupId, {
        title: title.trim(),
        originKind,
        attribution: attribution.trim() || null,
        rightsNotes: rightsNotes.trim() || null,
      })
      await onCreated()
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
      <h3 className="font-medium">Create song</h3>
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
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? 'Creating…' : 'Create song'}
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
