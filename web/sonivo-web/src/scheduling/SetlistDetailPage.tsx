import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, ListMusic, Music2, Trash2 } from 'lucide-react'
import {
  getSetlist,
  isConflictError,
  renameSetlist,
  replaceSetlistItems,
  type CurrentUser,
  type SetlistDetail,
  type SetlistItem,
} from '../api/client'
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'
import { EmptyPanel, Field, FormActions, PageBreadcrumb } from '../repertoire/chrome'
import {
  CONFLICT_MESSAGE,
  ConflictAlert,
  isOwnerRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from '../repertoire/ui'
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
      songTitle: item.songTitle ?? 'Canción desconocida',
      arrangementLabel: item.arrangementLabel ?? 'Arreglo desconocido',
    }))
}

function formatSongCount(count: number): string {
  return count === 1 ? '1 canción' : `${count} canciones`
}

function SetlistNumber({ n }: { n: number }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-light font-mono text-sm font-semibold text-slate-600">
      {String(n).padStart(2, '0')}
    </span>
  )
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
  const [showAdd, setShowAdd] = useState(false)

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
    setShowAdd(true)
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
    return <p aria-live="polite">Cargando lista…</p>
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

  if (setlist === undefined) {
    return <p aria-live="polite">Cargando lista…</p>
  }

  if (setlist === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? 'No se encontró la lista o no tienes acceso.'} />
        <Link
          className="font-semibold text-primary no-underline hover:underline"
          to={`/groups/${group.id}/setlists`}
        >
          Listas
        </Link>
      </div>
    )
  }

  const addPanelOpen = isOwner && (showAdd || draft.length === 0)

  return (
    <section className="space-y-6" aria-labelledby="setlist-heading">
      <div className="space-y-3">
        <PageBreadcrumb
          items={[
            { to: `/groups/${group.id}`, label: group.name },
            { to: `/groups/${group.id}/setlists`, label: 'Listas' },
            { label: setlist.name },
          ]}
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
              aria-hidden="true"
            >
              <ListMusic className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <h1 id="setlist-heading" className="text-2xl font-bold tracking-tight">
                {setlist.name}
              </h1>
              <p className="text-sm text-slate-500">
                {formatSongCount(draft.length)}
                {!isOwner ? <span> · Solo lectura</span> : null}
              </p>
            </div>
          </div>
          {isOwner ? (
            <Button disabled={saving} onClick={() => void saveItems()}>
              {saving ? 'Guardando…' : 'Guardar orden'}
            </Button>
          ) : null}
        </div>
      </div>

      <ProblemAlert message={error} />
      <ConflictAlert message={conflict} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="space-y-4" aria-labelledby="composition-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="composition-heading" className="text-lg font-semibold">
              Composición
            </h2>
            {isOwner && draft.length > 0 && !showAdd ? (
              <Button variant="ghost" onClick={() => setShowAdd(true)}>
                Agregar a la lista
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-slate-500">
            Ordena los arreglos que se tocan. Se permiten duplicados. Guardar reemplaza la lista
            completa.
          </p>

          {draft.length === 0 ? (
            <EmptyPanel
              title="Esta lista está vacía"
              description={
                isOwner
                  ? 'Agrega arreglos de la biblioteca para preparar el repertorio del evento.'
                  : 'Aún no hay arreglos en esta lista.'
              }
            />
          ) : (
            <ol className="space-y-2">
              {draft.map((item, index) => (
                <li
                  key={item.key}
                  className="library-enter flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-3"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <SetlistNumber n={item.sortOrder} />
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent"
                    aria-hidden="true"
                  >
                    <Music2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-neutral-dark">{item.songTitle}</span>
                    <span className="text-sm text-slate-500">{item.arrangementLabel}</span>
                  </span>
                  {isOwner ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={index === 0}
                        aria-label={`Subir ítem ${item.sortOrder}`}
                        onClick={() => moveItem(index, -1)}
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Subir</span>
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={index === draft.length - 1}
                        aria-label={`Bajar ítem ${item.sortOrder}`}
                        onClick={() => moveItem(index, 1)}
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Bajar</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Quitar ítem ${item.sortOrder}`}
                        onClick={() => removeItem(item.key)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Quitar</span>
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}

          {addPanelOpen ? (
            <div className="max-w-md space-y-3 rounded-2xl border border-slate-100 bg-neutral-light p-4">
              {options === null ? (
                <p aria-live="polite">Cargando arreglos…</p>
              ) : options.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No hay arreglos en la biblioteca. Agrega uno primero.
                </p>
              ) : (
                <>
                  <Field label="Arreglo">
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
                  </Field>
                  <FormActions>
                    <Button onClick={addSelectedArrangement}>Agregar a la lista</Button>
                    {draft.length > 0 ? (
                      <Button variant="secondary" onClick={() => setShowAdd(false)}>
                        Cancelar
                      </Button>
                    ) : null}
                  </FormActions>
                </>
              )}
            </div>
          ) : null}
        </section>

        <aside className="space-y-4 rounded-2xl bg-neutral-light p-5">
          <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Detalles
          </h2>
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
          ) : (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Nombre</dt>
                <dd className="font-medium text-neutral-dark">{setlist.name}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Canciones</dt>
                <dd className="font-medium text-neutral-dark">{formatSongCount(draft.length)}</dd>
              </div>
            </dl>
          )}

          {!renaming ? (
            <p className="text-xs text-slate-500">
              Una lista se puede aplicar a eventos cuando esté lista.
            </p>
          ) : null}

          {isOwner && !renaming ? (
            <Button variant="secondary" onClick={() => setRenaming(true)}>
              Renombrar lista
            </Button>
          ) : null}
        </aside>
      </div>
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
    <form className="space-y-3" onSubmit={onSubmit} noValidate>
      <p className="text-xs text-slate-500">Cambia el nombre de esta lista</p>
      <ProblemAlert message={error} />
      <Field label="Nombre">
        <input
          className={fieldClass}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
        />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending} size="sm">
          {pending ? 'Guardando…' : 'Guardar nombre'}
        </Button>
        <Button variant="secondary" size="sm" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </FormActions>
    </form>
  )
}
