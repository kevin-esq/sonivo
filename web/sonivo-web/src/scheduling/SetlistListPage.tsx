import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, ListMusic, Music2, Search, Star } from 'lucide-react'
import {
  createSetlist,
  listSetlists,
  type CurrentUser,
  type SetlistListItem,
} from '../api/client'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { fieldClass } from '../ui/field'
import { EmptyPanel, Field, FormActions, PageBreadcrumb, ReadinessChip } from '../repertoire/chrome'
import {
  canManageContentRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from '../repertoire/ui'
import { useT } from '../i18n'
import { plural } from '../ui/plural'

const SETLIST_TILES = [
  { Icon: ListMusic, tileClass: 'bg-primary/15 text-primary-ink' },
  { Icon: Music2, tileClass: 'bg-success/20 text-ink' },
  { Icon: Star, tileClass: 'bg-accent/20 text-accent' },
  { Icon: ListMusic, tileClass: 'bg-secondary text-ink' },
] as const

function setlistTile(index: number) {
  return SETLIST_TILES[index % SETLIST_TILES.length]!
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
  const { t } = useT()
  const [setlists, setSetlists] = useState<SetlistListItem[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [query, setQuery] = useState('')

  const isOwner = canManageContentRole(group?.role)

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
        <Link className="font-semibold text-primary-ink no-underline hover:underline" to="/">
          Mis grupos
        </Link>
      </div>
    )
  }

  const showHeaderAdd = isOwner && !showCreate && setlists !== null && setlists.length > 0
  const searching = query.trim().length > 0

  return (
    <section className="space-y-6" aria-labelledby="setlists-heading">
      <header data-testid="setlists-hero" className="space-y-3">
        <PageBreadcrumb
          items={[{ to: `/groups/${group.id}`, label: group.name }, { label: t('agenda.setlistsTitle') }]}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 id="setlists-heading" className="text-3xl font-bold tracking-tight text-ink">
              {t('agenda.setlistsTitle')}
            </h1>
            <p className="max-w-lg text-sm text-muted">{t('agenda.setlistsSubtitle')}</p>
            {!isOwner ? <p className="text-sm text-muted">Solo lectura</p> : null}
          </div>
          {setlists !== null ? (
            <ReadinessChip testId="setlists-count" tone="neutral">
              {plural(setlists.length, t('common.setlistOne'), t('common.setlistMany'))}
            </ReadinessChip>
          ) : null}
        </div>
      </header>

      {setlists !== null && setlists.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-52 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <label className="sr-only" htmlFor="setlists-search">
              {t('agenda.setlistsSearchLabel')}
            </label>
            <input
              id="setlists-search"
              data-testid="setlists-search"
              className={cn(fieldClass, 'min-h-11 pl-9')}
              type="search"
              placeholder={t('agenda.setlistsSearchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('agenda.setlistsSearchLabel')}
            />
          </div>
          {showHeaderAdd ? <Button onClick={() => setShowCreate(true)}>Nueva lista</Button> : null}
        </div>
      ) : null}
      {searching && filtered !== null ? (
        <p role="status" aria-live="polite" data-testid="setlists-results" className="text-sm text-muted">
          {plural(filtered.length, t('common.resultOne'), t('common.resultMany'))}
        </p>
      ) : null}

      <ProblemAlert message={listError} />

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
            action={
              isOwner ? (
                <Button data-testid="setlists-empty-create" onClick={() => setShowCreate(true)}>
                  Nueva lista
                </Button>
              ) : (
                <Link
                  className="font-semibold text-primary-ink no-underline hover:underline"
                  to={`/groups/${group.id}/library`}
                >
                  Ir a la biblioteca
                </Link>
              )
            }
          />
        )
      ) : filtered && filtered.length === 0 ? (
        <p className="text-sm text-muted">Ninguna lista coincide con «{query.trim()}».</p>
      ) : (
        <div className="space-y-1">
          <div
            aria-hidden="true"
            className="hidden px-2 text-xs font-semibold uppercase tracking-wide text-muted sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto_1.5rem] sm:items-center sm:gap-3"
          >
            <span>{t('agenda.setlistsColList')}</span>
            <span>{t('agenda.setlistsColSongs')}</span>
            <span>{t('agenda.setlistsColUpdated')}</span>
            <span />
          </div>
          <ul className="space-y-1 sm:space-y-0 sm:divide-y sm:divide-border-subtle sm:rounded-2xl sm:border sm:border-border-subtle sm:bg-surface">
            {filtered!.map((setlist, index) => {
              const { Icon, tileClass } = setlistTile(index)
              const empty = setlist.itemCount === 0
              return (
                <li
                  key={setlist.id}
                  className="library-enter"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <Link
                    className="flex min-h-[44px] items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-3 py-2.5 no-underline shadow-sm transition duration-150 hover:border-primary/25 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] motion-reduce:transition-none sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none sm:first:rounded-t-2xl sm:last:rounded-b-2xl"
                    to={`/groups/${group.id}/setlists/${setlist.id}`}
                  >
                    <span
                      className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11',
                        tileClass,
                      )}
                      aria-hidden="true"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">
                        {setlist.name}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {plural(setlist.itemCount, t('common.songOne'), t('common.songMany'))}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted sm:hidden">
                        Actualizado: {formatUpdatedAt(setlist.updatedAt)}
                      </span>
                    </span>
                    <ReadinessChip
                      tone={empty ? 'neutral' : 'accent'}
                      testId={`setlist-status-${setlist.id}`}
                    >
                      {empty
                        ? t('agenda.setlistVacant')
                        : plural(
                            setlist.itemCount,
                            t('agenda.setlistArrangementsOne'),
                            t('agenda.setlistArrangementsMany'),
                          )}
                    </ReadinessChip>
                    <span className="hidden text-xs text-muted sm:block">
                      {formatUpdatedAt(setlist.updatedAt)}
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
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
    <form className="max-w-lg space-y-4 border-t border-border-subtle pt-6" onSubmit={onSubmit} noValidate>
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
