import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, ListMusic, Music2, Search, Star } from 'lucide-react'
import { listSetlists, type CurrentUser, type SetlistListItem } from '../api/client'
import { cn } from '../ui/cn'
import {
  GroupButton,
  GroupEmptyState,
  GroupErrorState,
  GroupIconWell,
  GroupLink,
  GroupListSkeleton,
  GroupPageHeader,
  groupFieldClass,
  useGroupDataSignal,
} from '../groups/ui'
import { CreateSetlistDialog } from '../groups/dialogs'
import { ReadinessChip } from '../repertoire/chrome'
import {
  canManageContentRole,
  mutationErrorMessage,
  useGroupContext,
} from '../repertoire/ui'
import { useT } from '../i18n'
import { plural } from '../ui/plural'

const SETLIST_ICONS = [ListMusic, Music2, Star, ListMusic] as const

function setlistIcon(index: number) {
  return SETLIST_ICONS[index % SETLIST_ICONS.length]!
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
  const { group, error: groupError, reload: reloadGroup } = useGroupContext(groupId, user.id)
  const { t } = useT()
  const navigate = useNavigate()
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

  // Live refresh when setlists change elsewhere (creation dialog, other tab).
  useGroupDataSignal('setlists', groupId, () => void reload())

  if (group === undefined) {
    return <GroupListSkeleton rows={4} label={t('agenda.loadingSetlists')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState message={groupError} onRetry={() => void reloadGroup()} />
        <GroupLink variant="soft" to="/">
          Mis grupos
        </GroupLink>
      </div>
    )
  }

  const showHeaderAdd = isOwner && setlists !== null && setlists.length > 0
  const searching = query.trim().length > 0

  return (
    <section className="space-y-6" aria-labelledby="setlists-heading">
      <div data-testid="setlists-hero">
        <GroupPageHeader
          headingId="setlists-heading"
          icon={ListMusic}
          title={t('agenda.setlistsTitle')}
          subtitle={t('agenda.setlistsSubtitle')}
          breadcrumb={[
            { to: `/groups/${group.id}`, label: group.name },
            { label: t('agenda.setlistsTitle') },
          ]}
          actions={
            <>
              {setlists !== null ? (
                <ReadinessChip testId="setlists-count" tone="neutral">
                  {plural(setlists.length, t('common.setlistOne'), t('common.setlistMany'))}
                </ReadinessChip>
              ) : null}
              {showHeaderAdd ? (
                <GroupButton onClick={() => setShowCreate(true)}>Nueva lista</GroupButton>
              ) : null}
            </>
          }
        >
          {!isOwner ? <p className="text-sm text-muted">Solo lectura</p> : null}
        </GroupPageHeader>
      </div>

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
              className={cn(groupFieldClass, 'pl-9')}
              type="search"
              placeholder={t('agenda.setlistsSearchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('agenda.setlistsSearchLabel')}
            />
          </div>
        </div>
      ) : null}
      {searching && filtered !== null ? (
        <p role="status" aria-live="polite" data-testid="setlists-results" className="text-sm text-muted">
          {plural(filtered.length, t('common.resultOne'), t('common.resultMany'))}
        </p>
      ) : null}

      <GroupErrorState message={listError} />

      {setlists === null ? (
        <GroupListSkeleton rows={4} label={t('agenda.loadingSetlists')} />
      ) : setlists.length === 0 ? (
        <GroupEmptyState
          icon={ListMusic}
          title="Aún no hay listas"
          description={
            isOwner
              ? 'Crea una lista con arreglos de la biblioteca y aplícala a un evento cuando esté lista.'
              : 'Cuando haya listas, aparecerán aquí para preparar el repertorio.'
          }
          action={
            isOwner ? (
              <GroupButton data-testid="setlists-empty-create" onClick={() => setShowCreate(true)}>
                Nueva lista
              </GroupButton>
            ) : (
              <GroupLink variant="soft" to={`/groups/${group.id}/library`}>
                Ir a la biblioteca
              </GroupLink>
            )
          }
        />
      ) : filtered && filtered.length === 0 ? (
        <GroupEmptyState title={`Ninguna lista coincide con «${query.trim()}».`} />
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
              const Icon = setlistIcon(index)
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
                    <GroupIconWell icon={Icon} />
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
        <CreateSetlistDialog
          groupId={group.id}
          onClose={() => setShowCreate(false)}
          onCreated={(setlist) => {
            setShowCreate(false)
            void reload()
            navigate(`/groups/${group.id}/setlists/${setlist.id}`)
          }}
        />
      ) : null}
    </section>
  )
}
