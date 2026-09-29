import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import {
  createSong,
  listSongs,
  type CurrentUser,
  type SongListItem,
  type SongOriginKind,
} from '../api/client'
import { useT } from '../i18n'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
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
  const [query, setQuery] = useState('')
  const { t } = useT()

  const isOwner = isOwnerRole(group?.role)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!songs || !q) return songs
    return songs.filter(
      (song) =>
        song.title.toLowerCase().includes(q) ||
        (song.attribution ?? '').toLowerCase().includes(q),
    )
  }, [songs, query])

  const searching = query.trim().length > 0

  const showHeaderAdd = isOwner && !showCreate && songs !== null && songs.length > 0

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

  return (
    <section className="space-y-6" aria-labelledby="library-heading">
      <div
        data-testid="library-hero"
        className="overflow-hidden rounded-2xl"
        style={{
          background:
            'linear-gradient(120deg, color-mix(in srgb, var(--group-accent, #8366f1) 88%, #1e1b4b), color-mix(in srgb, var(--group-accent, #8366f1) 45%, transparent))',
        }}
      >
        <div className="space-y-3 px-5 py-6">
          <div className="[&_a]:text-white [&_nav]:text-white/70 [&_span]:text-white/70">
            <PageBreadcrumb items={[{ to: `/groups/${group.id}`, label: group.name }, { label: t('listas.title') }]} />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <h1 id="library-heading" className="text-3xl font-bold tracking-tight text-white">
                {t('listas.title')}
              </h1>
              <p className="max-w-lg text-sm text-white/80">
                {t('listas.subtitle')}
              </p>
              {!isOwner ? <p className="text-sm text-white/80">Solo lectura</p> : null}
            </div>
            {songs !== null ? (
              <p data-testid="library-count" className="flex items-baseline gap-2 text-white">
                <span className="text-3xl font-bold">{songs.length}</span>
                <span className="text-sm text-white/80">{t('listas.songsLabel')}</span>
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {songs !== null && songs.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-52 flex-1">
            <label className="sr-only" htmlFor="library-search">
              {t('listas.searchLabel')}
            </label>
            <input
              id="library-search"
              type="search"
              data-testid="library-search"
              aria-label={t('listas.searchLabel')}
              placeholder={t('listas.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={cn(fieldClass, 'min-h-11')}
              maxLength={200}
            />
          </div>
          {showHeaderAdd ? <AddSongButton onClick={() => setShowCreate(true)} /> : null}
        </div>
      ) : null}
      {searching && filtered !== null ? (
        <p role="status" aria-live="polite" data-testid="library-results" className="text-sm text-slate-500">
          {filtered.length} {t('listas.resultsWord')}
        </p>
      ) : null}

      <ProblemAlert message={listError} />

      {songs === null || filtered === null ? (
        <ListSkeleton rows={4} label="Cargando canciones…" />
      ) : songs.length === 0 ? (
        showCreate ? null : (
        <EmptyPanel
          title="Aún no hay canciones"
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
      ) : filtered.length === 0 ? (
        <EmptyPanel
          title={t('listas.noResultsTitle')}
          description={t('listas.noResultsBody')}
          action={
            <Button variant="secondary" onClick={() => setQuery('')}>
              {t('listas.clearSearch')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-1">
          <div
            aria-hidden="true"
            className="hidden px-2 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:grid sm:grid-cols-[2.75rem_minmax(0,1fr)_auto_1.5rem] sm:items-center sm:gap-3"
          >
            <span />
            <span>{t('listas.colSong')}</span>
            <span>{t('listas.colOrigin')}</span>
            <span />
          </div>
          <ul className="space-y-1 sm:space-y-0 sm:divide-y sm:divide-slate-100 sm:rounded-2xl sm:border sm:border-slate-100 sm:bg-white">
            {filtered.map((song, index) => (
              <li
                key={song.id}
                className="library-enter"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <Link
                  className="flex min-h-[44px] items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 no-underline shadow-sm transition duration-150 hover:bg-neutral-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] motion-reduce:transition-none sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none sm:first:rounded-t-2xl sm:last:rounded-b-2xl"
                  to={`/groups/${group.id}/songs/${song.id}`}
                >
                  <OriginMark kind={song.originKind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-neutral-dark">{song.title}</span>
                    {song.attribution ? (
                      <span className="block truncate text-sm text-slate-500">{song.attribution}</span>
                    ) : null}
                  </span>
                  <OriginBadge kind={song.originKind} />
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
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
