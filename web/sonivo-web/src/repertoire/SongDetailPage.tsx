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
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'
import {
  EmptyPanel,
  Field,
  FormActions,
  NumberedMark,
  OriginBadge,
  OriginMark,
  PageBreadcrumb,
} from './chrome'
import {
  CONFLICT_MESSAGE,
  ConfirmDialog,
  ConflictAlert,
  formatArrangementCount,
  formatOriginKind,
  isOwnerRole,
  mutationErrorMessage,
  ProblemAlert,
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
    return <p aria-live="polite">Cargando canción…</p>
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

  if (song === undefined) {
    return <p aria-live="polite">Cargando canción…</p>
  }

  if (song === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? 'No se encontró la canción o no tienes acceso.'} />
        <Link
          className="font-semibold text-primary no-underline hover:underline"
          to={`/groups/${group.id}/library`}
        >
          Biblioteca
        </Link>
      </div>
    )
  }

  const showAddArrangement =
    isOwner && !creatingArrangement && arrangements !== null

  return (
    <section className="space-y-6" aria-labelledby="song-heading">
      <div className="space-y-3">
        <PageBreadcrumb
          items={[
            { to: `/groups/${group.id}`, label: group.name },
            { to: `/groups/${group.id}/library`, label: 'Biblioteca' },
            { label: song.title },
          ]}
        />
        <div className="flex flex-wrap items-start gap-3">
          <OriginMark kind={song.originKind} />
          <div className="min-w-0 flex-1 space-y-2">
            <h1 id="song-heading" className="text-2xl font-bold tracking-tight">
              {song.title}
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <OriginBadge kind={song.originKind} />
              <span>{formatArrangementCount(song.arrangementCount)}</span>
              {song.attribution ? <span>· {song.attribution}</span> : null}
              {!isOwner ? <span>· Solo lectura</span> : null}
            </p>
          </div>
        </div>
      </div>

      <ProblemAlert message={error} />
      <ConflictAlert message={conflict} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="space-y-4" aria-labelledby="arrangements-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="arrangements-heading" className="text-lg font-semibold">
              Arreglos
            </h2>
            {showAddArrangement && (arrangements?.length ?? 0) > 0 ? (
              <Button onClick={() => setCreatingArrangement(true)}>Agregar arreglo</Button>
            ) : null}
          </div>
          <p className="text-sm text-slate-500">
            Cada arreglo es la versión que se ensaya y se toca, con sus materiales.
          </p>

          {arrangements === null ? (
            <p aria-live="polite">Cargando arreglos…</p>
          ) : arrangements.length === 0 && !creatingArrangement ? (
            <EmptyPanel
              title="Esta canción aún no tiene arreglos"
              description="Un arreglo es la realización que se lleva a ensayo y a una lista. La canción puede existir sin arreglos."
              action={
                showAddArrangement ? (
                  <Button onClick={() => setCreatingArrangement(true)}>Agregar arreglo</Button>
                ) : null
              }
            />
          ) : (
            <ol className="divide-y divide-slate-100">
              {arrangements.map((arrangement, index) => (
                <li
                  key={arrangement.id}
                  className="library-enter"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <Link
                    className="flex items-center gap-3 rounded-xl px-2 py-3 no-underline transition duration-150 hover:bg-neutral-light"
                    to={`/groups/${group.id}/arrangements/${arrangement.id}`}
                  >
                    <NumberedMark n={index + 1} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-neutral-dark">{arrangement.label}</span>
                      <span className="text-sm text-slate-500">
                        {arrangement.defaultKey ? arrangement.defaultKey : ''}
                        {arrangement.defaultBpm != null
                          ? `${arrangement.defaultKey ? ' · ' : ''}${arrangement.defaultBpm} BPM`
                          : !arrangement.defaultKey
                            ? 'Sin tonalidad ni tempo'
                            : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}

          {isOwner && creatingArrangement ? (
            <ArrangementCreateForm
              groupId={group.id}
              songId={song.id}
              onCancel={() => setCreatingArrangement(false)}
              onCreated={async (createdId) => {
                setCreatingArrangement(false)
                navigate(`/groups/${group.id}/arrangements/${createdId}`)
              }}
            />
          ) : null}
        </section>

        <aside className="space-y-4 rounded-2xl bg-neutral-light p-5">
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
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Origen</dt>
                <dd className="font-medium">{formatOriginKind(song.originKind)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Atribución</dt>
                <dd className="font-medium">{song.attribution ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Notas de derechos</dt>
                <dd className="whitespace-pre-wrap font-medium">{song.rightsNotes ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Arreglos</dt>
                <dd className="font-medium">{formatArrangementCount(song.arrangementCount)}</dd>
              </div>
            </dl>
          )}

          {isOwner && !editing ? (
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Editar canción
              </Button>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Eliminar canción
              </Button>
            </div>
          ) : null}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="¿Eliminar canción?"
        confirmLabel="Eliminar canción"
        cancelLabel="Cancelar"
        pendingLabel="Eliminando…"
        pending={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
      >
        <p>
          Esto oculta la canción y sus arreglos activos de las vistas normales. Los recursos
          enlazados se conservan en el servidor.
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
  const [originKind, setOriginKind] = useState<SongOriginKind>(song.originKind as SongOriginKind)
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
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <h3 className="font-semibold">Editar canción</h3>
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
      <Field label="Origen">
        <select
          className={fieldClass}
          required
          value={originKind}
          onChange={(e) => setOriginKind(e.target.value as SongOriginKind)}
        >
          <option value="original">Propia</option>
          <option value="cover">Versión</option>
          <option value="other">Otro</option>
        </select>
      </Field>
      <Field label="Atribución (opcional)" hint="Vacía el campo para quitar la atribución.">
        <input
          className={fieldClass}
          value={attribution}
          onChange={(e) => setAttribution(e.target.value)}
          maxLength={500}
        />
      </Field>
      <Field label="Notas de derechos (opcional)" hint="Vacía el campo para quitar las notas.">
        <textarea
          className={fieldClass}
          rows={3}
          value={rightsNotes}
          onChange={(e) => setRightsNotes(e.target.value)}
          maxLength={2000}
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
        setError('El tempo (BPM) debe ser un entero entre 1 y 400.')
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
    <form className="space-y-4 border-t border-slate-200 pt-4" onSubmit={onSubmit} noValidate>
      <h3 className="font-semibold">Crear arreglo</h3>
      <ProblemAlert message={error} />
      <Field label="Etiqueta">
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label="Tonalidad (opcional)">
        <input
          className={fieldClass}
          value={defaultKey}
          onChange={(e) => setDefaultKey(e.target.value)}
          maxLength={32}
        />
      </Field>
      <Field label="Tempo / BPM (opcional, 1–400)">
        <input
          className={fieldClass}
          type="number"
          min={1}
          max={400}
          inputMode="numeric"
          value={defaultBpm}
          onChange={(e) => setDefaultBpm(e.target.value)}
        />
      </Field>
      <Field label="Letra (opcional)">
        <textarea className={fieldClass} rows={3} value={lyrics} onChange={(e) => setLyrics(e.target.value)} />
      </Field>
      <Field label="Acordes (opcional)">
        <textarea className={fieldClass} rows={3} value={chords} onChange={(e) => setChords(e.target.value)} />
      </Field>
      <Field label="Estructura (opcional)">
        <textarea
          className={fieldClass}
          rows={2}
          value={structure}
          onChange={(e) => setStructure(e.target.value)}
        />
      </Field>
      <Field label="Notas (opcional)">
        <textarea className={fieldClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? 'Creando…' : 'Crear arreglo'}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </FormActions>
    </form>
  )
}
