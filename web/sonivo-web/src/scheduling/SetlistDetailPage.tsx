import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getSetlist,
  isConflictError,
  renameSetlist,
  replaceSetlistItems,
  type CurrentUser,
  type SetlistDetail,
  type SetlistItem,
} from '../api/client'
import {
  CONFLICT_MESSAGE,
  ConflictAlert,
  fieldClass,
  isOwnerRole,
  mutationErrorMessage,
  primaryButtonClass,
  ProblemAlert,
  secondaryButtonClass,
  useGroupContext,
} from '../repertoire/ui'
import { GroupSectionNav } from './GroupSectionNav'
import {
  formatArrangementOption,
  loadLiveArrangementOptions,
  type LiveArrangementOption,
} from './liveArrangements'

type DraftItem = {
  key: string
  arrangementId: string
  sortOrder: number
  songTitle: string
  arrangementLabel: string
}

function toDraft(items: SetlistItem[]): DraftItem[] {
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({
      key: item.id,
      arrangementId: item.arrangementId,
      sortOrder: index + 1,
      songTitle: item.songTitle ?? 'Unknown song',
      arrangementLabel: item.arrangementLabel ?? 'Unknown arrangement',
    }))
}

export function SetlistDetailPage({ user }: { user: CurrentUser }) {
  const { groupId, setlistId } = useParams()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [setlist, setSetlist] = useState<SetlistDetail | null | undefined>(undefined)
  const [draft, setDraft] = useState<DraftItem[]>([])
  const [options, setOptions] = useState<LiveArrangementOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedArrangementId, setSelectedArrangementId] = useState('')

  const isOwner = isOwnerRole(group?.role)

  async function reload() {
    if (!groupId || !setlistId) return
    const [nextSetlist, nextOptions] = await Promise.all([
      getSetlist(groupId, setlistId),
      loadLiveArrangementOptions(groupId),
    ])
    setSetlist(nextSetlist)
    setDraft(toDraft(nextSetlist.items))
    setOptions(nextOptions)
    if (nextOptions[0] && !selectedArrangementId) {
      setSelectedArrangementId(nextOptions[0].arrangementId)
    }
  }

  useEffect(() => {
    if (!groupId || !setlistId || !group) return
    let cancelled = false
    async function load() {
      setSetlist(undefined)
      setError(null)
      setConflict(null)
      try {
        const [nextSetlist, nextOptions] = await Promise.all([
          getSetlist(groupId!, setlistId!),
          loadLiveArrangementOptions(groupId!),
        ])
        if (cancelled) return
        setSetlist(nextSetlist)
        setDraft(toDraft(nextSetlist.items))
        setOptions(nextOptions)
        setSelectedArrangementId(nextOptions[0]?.arrangementId ?? '')
      } catch (err) {
        if (cancelled) return
        setSetlist(null)
        setOptions([])
        setError(mutationErrorMessage(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, setlistId, group])

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= draft.length) return
    const next = [...draft]
    const current = next[index]
    const swapped = next[target]
    if (!current || !swapped) return
    next[index] = swapped
    next[target] = current
    setDraft(next.map((item, i) => ({ ...item, sortOrder: i + 1 })))
  }

  function addSelectedArrangement() {
    const option = options?.find((item) => item.arrangementId === selectedArrangementId)
    if (!option) return
    setDraft((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        arrangementId: option.arrangementId,
        sortOrder: current.length + 1,
        songTitle: option.songTitle,
        arrangementLabel: option.arrangementLabel,
      },
    ])
  }

  function removeItem(key: string) {
    setDraft((current) =>
      current.filter((item) => item.key !== key).map((item, i) => ({ ...item, sortOrder: i + 1 })),
    )
  }

  async function saveItems() {
    if (!groupId || !setlistId || !setlist) return
    setSaving(true)
    setError(null)
    setConflict(null)
    try {
      const updated = await replaceSetlistItems(
        groupId,
        setlistId,
        setlist.version,
        draft.map((item, index) => ({
          arrangementId: item.arrangementId,
          sortOrder: index + 1,
        })),
      )
      setSetlist(updated)
      setDraft(toDraft(updated.items))
    } catch (err) {
      if (isConflictError(err)) {
        setConflict(CONFLICT_MESSAGE)
        try {
          await reload()
        } catch (reloadErr) {
          setError(mutationErrorMessage(reloadErr))
        }
      } else {
        setError(mutationErrorMessage(err))
      }
    } finally {
      setSaving(false)
    }
  }

  if (group === undefined) {
    return <p aria-live="polite">Loading setlist…</p>
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

  if (setlist === undefined) {
    return <p aria-live="polite">Loading setlist…</p>
  }

  if (setlist === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? 'Setlist not found or you do not have access.'} />
        <Link className="underline" to={`/groups/${group.id}/setlists`}>
          Back to setlists
        </Link>
      </div>
    )
  }

  return (
    <section className="space-y-6" aria-labelledby="setlist-heading">
      <div className="space-y-2">
        <p className="text-sm text-slate-600">
          <Link className="underline" to={`/groups/${group.id}`}>
            {group.name}
          </Link>
          <span aria-hidden="true"> / </span>
          <Link className="underline" to={`/groups/${group.id}/setlists`}>
            Setlists
          </Link>
          <span aria-hidden="true"> / </span>
          Setlist
        </p>
        <h2 id="setlist-heading" className="text-xl font-medium">
          {setlist.name}
        </h2>
        <p className="text-slate-600">
          Role: <strong>{group.role}</strong>
          {!isOwner ? <span> (read-only)</span> : null}
          <span className="mx-2" aria-hidden="true">
            ·
          </span>
          Version: <strong>{setlist.version}</strong>
        </p>
        <GroupSectionNav groupId={group.id} />
      </div>

      <ProblemAlert message={error} />
      <ConflictAlert message={conflict} />

      {renaming && isOwner ? (
        <RenameSetlistForm
          groupId={group.id}
          setlist={setlist}
          onCancel={() => setRenaming(false)}
          onSaved={(next) => {
            setSetlist(next)
            setRenaming(false)
            setConflict(null)
          }}
          onConflict={async () => {
            setConflict(CONFLICT_MESSAGE)
            setRenaming(false)
            try {
              await reload()
            } catch (err) {
              setError(mutationErrorMessage(err))
            }
          }}
        />
      ) : isOwner ? (
        <button type="button" className={secondaryButtonClass} onClick={() => setRenaming(true)}>
          Rename setlist
        </button>
      ) : null}

      <section className="space-y-4 border-t border-slate-300 pt-6" aria-labelledby="items-heading">
        <h3 id="items-heading" className="font-medium">
          Arrangements
        </h3>
        <p className="text-sm text-slate-600">
          Duplicate arrangements are allowed. Save replaces the full ordered list.
        </p>

        {draft.length === 0 ? (
          <p>No arrangements yet.{isOwner ? ' Add live arrangements from the library.' : ''}</p>
        ) : (
          <ol className="space-y-3">
            {draft.map((item, index) => (
              <li key={item.key} className="border border-slate-200 p-3">
                <p>
                  <span className="mr-2 text-sm text-slate-500">{item.sortOrder}.</span>
                  {item.songTitle} — {item.arrangementLabel}
                </p>
                {isOwner ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={index === 0}
                      aria-label={`Move item ${item.sortOrder} up`}
                      onClick={() => moveItem(index, -1)}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={index === draft.length - 1}
                      aria-label={`Move item ${item.sortOrder} down`}
                      onClick={() => moveItem(index, 1)}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      aria-label={`Remove item ${item.sortOrder}`}
                      onClick={() => removeItem(item.key)}
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        {isOwner ? (
          <div className="max-w-md space-y-3">
            {options === null ? (
              <p aria-live="polite">Loading arrangements…</p>
            ) : options.length === 0 ? (
              <p>No live arrangements. Add one in the library first.</p>
            ) : (
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-sm text-slate-700">Arrangement</span>
                  <select
                    className={fieldClass}
                    value={selectedArrangementId}
                    onChange={(e) => setSelectedArrangementId(e.target.value)}
                  >
                    {options.map((option) => (
                      <option key={option.arrangementId} value={option.arrangementId}>
                        {formatArrangementOption(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={addSelectedArrangement}
                >
                  Add to setlist
                </button>
              </div>
            )}
            <button
              type="button"
              className={primaryButtonClass}
              disabled={saving}
              onClick={() => void saveItems()}
            >
              {saving ? 'Saving…' : 'Save order'}
            </button>
          </div>
        ) : null}
      </section>
    </section>
  )
}

function RenameSetlistForm({
  groupId,
  setlist,
  onCancel,
  onSaved,
  onConflict,
}: {
  groupId: string
  setlist: SetlistDetail
  onCancel: () => void
  onSaved: (setlist: SetlistDetail) => void
  onConflict: () => Promise<void>
}) {
  const [name, setName] = useState(setlist.name)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const updated = await renameSetlist(groupId, setlist.id, setlist.version, name.trim())
      onSaved(updated)
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
      <h3 className="font-medium">Rename setlist</h3>
      <p className="text-sm text-slate-600">Editing version {setlist.version}</p>
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
          {pending ? 'Saving…' : 'Save name'}
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
