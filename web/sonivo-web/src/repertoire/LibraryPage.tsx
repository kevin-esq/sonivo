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
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'
import { ListSkeleton, PageSkeleton } from '../ui/skeleton'
import {
  AddSongButton,
  EmptyPanel,
  Field,
  FormActions,
  OriginBadge,
  OriginMark,
  PageBreadcrumb,
} from './chrome'
import {
  isOwnerRole,
  mutationErrorMessage,
  ProblemAlert,
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
    return <PageSkeleton label="Cargando biblioteca…" />
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

  const showHeaderAdd = isOwner && !showCreate && songs !== null && songs.length > 0

  return (
    <section className="space-y-6" aria-labelledby="library-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <PageBreadcrumb items={[{ to: `/groups/${group.id}`, label: group.name }, { label: 'Biblioteca' }]} />
          <h1 id="library-heading" className="text-2xl font-bold tracking-tight">
            Biblioteca
          </h1>
          <p className="text-sm text-slate-500">
            El repertorio del grupo: canciones para ensayar, arreglar y llevar a un evento.
          </p>
          {!isOwner ? <p className="text-sm text-slate-500">Solo lectura</p> : null}
        </div>
        {showHeaderAdd ? <AddSongButton onClick={() => setShowCreate(true)} /> : null}
      </div>

      <ProblemAlert message={listError} />

      {songs === null ? (
        <ListSkeleton rows={4} label="Cargando canciones…" />
      ) : songs.length === 0 ? (
        showCreate ? null : (
        <EmptyPanel
          title="La biblioteca está vacía"
          description={
            isOwner
              ? 'Agrega la primera canción para empezar el repertorio, ensayar y armar listas.'
              : 'Aún no hay canciones en el repertorio.'
          }
          action={
            isOwner ? (
              <Button data-testid="library-empty-add-song" onClick={() => setShowCreate(true)}>
                Agregar canción
              </Button>
            ) : (
              <Link
                className="font-semibold text-primary no-underline hover:underline"
                to={`/groups/${group.id}`}
              >
                Volver al inicio
              </Link>
            )
          }
        />
        )
      ) : (
        <ul className="divide-y divide-slate-100">
          {songs.map((song, index) => (
            <li
              key={song.id}
              className="library-enter"
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              <Link
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 no-underline transition duration-150 hover:bg-neutral-light"
                to={`/groups/${group.id}/songs/${song.id}`}
              >
                <OriginMark kind={song.originKind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-neutral-dark">{song.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <OriginBadge kind={song.originKind} />
                    {song.attribution ? <span>{song.attribution}</span> : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isOwner && showCreate ? (
        <SongCreateForm
          groupId={group.id}
          onCancel={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false)
            await reloadSongs()
          }}
        />
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
    <form className="max-w-lg space-y-4 border-t border-slate-200 pt-6" onSubmit={onSubmit} noValidate>
      <h2 className="text-lg font-semibold">Crear canción</h2>
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
      <Field label="Atribución (opcional)">
        <input
          className={fieldClass}
          value={attribution}
          onChange={(e) => setAttribution(e.target.value)}
          maxLength={500}
        />
      </Field>
      <Field label="Notas de derechos (opcional)">
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
          {pending ? 'Creando…' : 'Crear canción'}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </FormActions>
    </form>
  )
}
