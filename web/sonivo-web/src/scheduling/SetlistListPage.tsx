import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ListMusic, Music2, Search, Star } from 'lucide-react'
import {
  createSetlist,
  listSetlists,
  type CurrentUser,
  type SetlistListItem,
} from '../api/client'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { fieldClass } from '../ui/field'
import { EmptyPanel, Field, FormActions, PageBreadcrumb } from '../repertoire/chrome'
import {
  isOwnerRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from '../repertoire/ui'

const SETLIST_TILES = [
  { Icon: ListMusic, tileClass: 'bg-primary/15 text-primary' },
  { Icon: Music2, tileClass: 'bg-success/20 text-neutral-dark' },
  { Icon: Star, tileClass: 'bg-accent/20 text-accent' },
  { Icon: ListMusic, tileClass: 'bg-secondary text-neutral-dark' },
] as const

function setlistTile(index: number) {
  return SETLIST_TILES[index % SETLIST_TILES.length]!
}

function formatSongCount(count: number): string {
  return count === 1 ? '1 canción' : `${count} canciones`
}

function formatUpdatedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function SetlistListPage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [setlists, setSetlists] = useState<SetlistListItem[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [query, setQuery] = useState('')

  const isOwner = isOwnerRole(group?.role)

  const filtered = useMemo(() => {
    if (!setlists) return null
    const q = query.trim().toLowerCase()
    if (!q) return setlists
    return setlists.filter((item) => item.name.toLowerCase().includes(q))
  }, [setlists, query])

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
    return <p aria-live="polite">Cargando listas…</p>
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

  const showHeaderAdd = isOwner && !showCreate

  return (
    <section className="space-y-6" aria-labelledby="setlists-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <PageBreadcrumb
            items={[{ to: `/groups/${group.id}`, label: group.name }, { label: 'Listas' }]}
          />
          <h1 id="setlists-heading" className="text-2xl font-bold tracking-tight">
            Listas
          </h1>
          <p className="text-sm text-slate-500">
            Crea y administra tus listas. Luego podrás aplicarlas a tus eventos.
          </p>
          {!isOwner ? <p className="text-sm text-slate-500">Solo lectura</p> : null}
        </div>
        {showHeaderAdd ? (
          <Button onClick={() => setShowCreate(true)}>Nueva lista</Button>
        ) : null}
      </div>

      <ProblemAlert message={listError} />

      {setlists !== null && setlists.length > 0 ? (
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            className={cn(fieldClass, 'pl-9')}
            type="search"
            placeholder="Buscar listas…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar listas"
          />
        </div>
      ) : null}

      {setlists === null ? (
        <p aria-live="polite">Cargando listas…</p>
      ) : setlists.length === 0 ? (
        showCreate ? null : (
          <EmptyPanel
            title="Aún no hay listas"
            description={
              isOwner
                ? 'Crea una lista con arreglos de la biblioteca y aplícala a un evento cuando esté lista.'
                : 'Cuando haya listas, aparecerán aquí para preparar el repertorio.'
            }
          />
        )
      ) : filtered && filtered.length === 0 ? (
        <p className="text-sm text-slate-500">Ninguna lista coincide con «{query.trim()}».</p>
      ) : (
        <ul className="space-y-2">
          {filtered!.map((setlist, index) => {
            const { Icon, tileClass } = setlistTile(index)
            return (
              <li
                key={setlist.id}
                className="library-enter"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <Link
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-3 no-underline transition duration-150 hover:border-primary/25 hover:bg-neutral-light"
                  to={`/groups/${group.id}/setlists/${setlist.id}`}
                >
                  <span
                    className={cn(
                      'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                      tileClass,
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-neutral-dark">
                      {setlist.name}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-500">
                      {formatSongCount(setlist.itemCount)}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      Actualizado: {formatUpdatedAt(setlist.updatedAt)}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {isOwner && showCreate ? (
        <SetlistCreateForm
          groupId={group.id}
          onCancel={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false)
            await reload()
          }}
        />
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
    <form className="max-w-lg space-y-4 border-t border-slate-200 pt-6" onSubmit={onSubmit} noValidate>
      <h2 className="text-lg font-semibold">Crear lista</h2>
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
        <Button type="submit" disabled={pending}>
          {pending ? 'Creando…' : 'Crear lista'}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </FormActions>
    </form>
  )
}
