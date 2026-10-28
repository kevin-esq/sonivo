import { routes } from '../routing/routes'
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Heart, Library, Music2, Pencil, Search, SlidersHorizontal } from 'lucide-react'
import { getSong, searchSongs, setSongFavorite, type CurrentUser, type SongCatalogPage, type SongDetail } from '../api/client'
import { useT, type I18nKey } from '../i18n'
import {
  GroupButton,
  GroupActionMenu,
  GroupChip,
  GroupDialog,
  GroupEmptyState,
  GroupErrorState,
  GroupLimitNotice,
  GroupLink,
  GroupListSkeleton,
  GroupPageHeader,
  GroupPageSkeleton,
  groupFieldClass,
  limitReached,
  useGroupDataSignal,
} from '../groups/ui'
import { useGroupUsage } from '../groups/useGroupUsage'
import { CreateSongDialog } from '../groups/dialogs'
import { OriginMark } from './chrome'
import { plural } from '../ui/plural'
import { AppLink } from '../routing/AppLink'
import { useGroupShell } from '../shell/GroupShellContext'
import {
  canManageContentRole,
  mutationErrorMessage,
  useGroupContext,
} from './ui'
import { SongEditForm } from './SongDetailPage'

type LibrarySort = 'title' | 'artist' | 'recent' | 'updated' | 'theme'
type SortDirection = 'asc' | 'desc'
const SONG_PAGE_SIZE = 25

function parseSort(value: string | null): LibrarySort {
  return value && LIBRARY_SORTS.some((item) => item.id === value) ? value as LibrarySort : 'recent'
}

function parsePage(value: string | null): number {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

function parseDirection(value: string | null, sort: LibrarySort): SortDirection {
  if (value === 'asc' || value === 'desc') return value
  return sort === 'recent' || sort === 'updated' ? 'desc' : 'asc'
}

const LIBRARY_SORTS: { id: LibrarySort; labelKey: I18nKey }[] = [
  { id: 'title', labelKey: 'songs.sortTitle' },
  { id: 'artist', labelKey: 'songs.sortArtist' },
  { id: 'recent', labelKey: 'songs.sortRecent' },
  { id: 'updated', labelKey: 'songs.sortUpdated' },
  { id: 'theme', labelKey: 'songs.tabByTheme' },
]

export function LibraryPage({ user }: { user: CurrentUser }) {
  const { groupId, pathname, search, navigate, navigationMode } = useGroupShell()
  const { group, error: groupError, reload: reloadGroup } = useGroupContext(groupId, user.id)
  const [catalog, setCatalog] = useState<SongCatalogPage | null>(null)
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingSong, setEditingSong] = useState<SongDetail | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const initialParams = new URLSearchParams(search)
  const [query, setQuery] = useState(() => initialParams.get('q') ?? '')
  const [favoritesOnly, setFavoritesOnly] = useState(() => initialParams.get('favoritesOnly') === 'true')
  const [theme, setTheme] = useState(() => initialParams.get('tag') ?? '')
  const [sort, setSort] = useState<LibrarySort>(() => parseSort(initialParams.get('sort')))
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => parseDirection(initialParams.get('direction'), parseSort(initialParams.get('sort'))))
  const [page, setPage] = useState(() => parsePage(initialParams.get('page')))
  const [favoritePending, setFavoritePending] = useState<Set<string>>(() => new Set())
  const [refreshKey, setRefreshKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { t, lang } = useT()

  useEffect(() => {
    const params = new URLSearchParams(search)
    setQuery(params.get('q') ?? '')
    setFavoritesOnly(params.get('favoritesOnly') === 'true')
    setTheme(params.get('tag') ?? '')
    const nextSort = parseSort(params.get('sort'))
    setSort(nextSort)
    setSortDirection(parseDirection(params.get('direction'), nextSort))
    setPage(parsePage(params.get('page')))
  }, [search])

  useEffect(() => {
    if (!groupId || !pathname.endsWith('/library')) return
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (theme) params.set('tag', theme)
    if (favoritesOnly) params.set('favoritesOnly', 'true')
    if (sort !== 'recent') params.set('sort', sort)
    if (sortDirection !== (sort === 'recent' || sort === 'updated' ? 'desc' : 'asc')) params.set('direction', sortDirection)
    if (page > 1) params.set('page', String(page))
    const nextSearch = params.toString()
    const nextUrl = `${routes.groupLibrary(groupId)}${nextSearch ? `?${nextSearch}` : ''}`
    const currentUrl = `${pathname}${search}`
    if (nextUrl === currentUrl) return
    const timer = window.setTimeout(() => {
      if (navigationMode === 'next') window.history.replaceState(null, '', nextUrl)
      else navigate(nextUrl, { replace: true })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [groupId, pathname, search, navigate, navigationMode, query, theme, favoritesOnly, sort, sortDirection, page])

  const isOwner = canManageContentRole(group?.role)
  const { usage, reload: reloadUsage } = useGroupUsage(groupId)
  const songsAtLimit = limitReached(usage?.songs)
  const catalogQueryKey = JSON.stringify([
    groupId,
    query.trim(),
    theme,
    favoritesOnly,
    sort,
    sortDirection,
    page,
    refreshKey,
  ])
  const catalogIsStale = catalog !== null && loadedQueryKey !== catalogQueryKey

  const songs = catalog?.items ?? null
  const totalCount = catalog?.totalCount ?? 0
  const searching = query.trim().length > 0 || Boolean(theme) || favoritesOnly
  const showHeaderAdd = isOwner && catalog !== null && totalCount > 0

  useEffect(() => {
    if (!groupId || !group) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchSongs(groupId, {
          query,
          tag: theme,
          favoritesOnly,
          sort,
          sortDirection,
          page,
          pageSize: SONG_PAGE_SIZE,
        })
        if (!cancelled) {
          setCatalog(result)
          setLoadedQueryKey(catalogQueryKey)
          setListError(null)
          setIsRefreshing(false)
        }
      } catch (err) {
        if (cancelled) return
        setListError(mutationErrorMessage(err, t))
        setIsRefreshing(false)
      }
    }, query.trim() ? 250 : 0)
    setIsRefreshing(true)
    setListError(null)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [groupId, group, query, theme, favoritesOnly, sort, sortDirection, page, refreshKey, catalogQueryKey, t])

  useEffect(() => {
    if (catalog && catalog.page !== page) setPage(catalog.page)
  }, [catalog, page])

  async function toggleFavorite(songId: string, nextValue: boolean) {
    if (!groupId || favoritePending.has(songId)) return
    setFavoritePending((current) => new Set(current).add(songId))
    try {
      await setSongFavorite(groupId, songId, nextValue)
      setCatalog((current) => current ? {
        ...current,
        items: current.items.flatMap((song) => {
          if (song.id !== songId) return [song]
          if (favoritesOnly && !nextValue) return []
          return [{ ...song, isFavorite: nextValue }]
        }),
        totalCount: favoritesOnly && !nextValue ? Math.max(0, current.totalCount - 1) : current.totalCount,
        totalPages: favoritesOnly && !nextValue
          ? Math.ceil(Math.max(0, current.totalCount - 1) / current.pageSize)
          : current.totalPages,
      } : current)
    } catch (err) {
      setListError(mutationErrorMessage(err, t))
    } finally {
      setFavoritePending((current) => {
        const next = new Set(current)
        next.delete(songId)
        return next
      })
    }
  }

  async function openSongEditor(songId: string) {
    if (!groupId) return
    setEditError(null)
    try {
      setEditingSong(await getSong(groupId, songId))
    } catch (err) {
      setEditError(mutationErrorMessage(err, t))
    }
  }

  function selectSort(nextSort: LibrarySort) {
    if (sort === nextSort) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    } else {
      setSort(nextSort)
      setSortDirection(nextSort === 'recent' || nextSort === 'updated' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  // Live refresh when songs change elsewhere (creation dialog, other tab).
  useGroupDataSignal('songs', groupId, () => {
    setRefreshKey((current) => current + 1)
    void reloadUsage()
  })

  if (group === undefined) {
    return <GroupPageSkeleton label={t('songs.loadingLibrary')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState message={groupError} onRetry={() => void reloadGroup()} />
        <GroupLink variant="soft" to={routes.home}>
          {t('songs.myGroups')}
        </GroupLink>
      </div>
    )
  }

  const sortOptions = LIBRARY_SORTS.map((item) => ({ value: item.id, label: t(item.labelKey) }))

  return (
    <section className="space-y-6 pb-16" aria-labelledby="library-heading">
      <div data-testid="library-hero">
        <GroupPageHeader
          headingId="library-heading"
          icon={Library}
          title={t('songs.pageTitle')}
          subtitle={t('songs.pageSubtitle')}
          breadcrumb={[
            { to: routes.group(group.id), label: group.name },
            { label: t('songs.pageTitle') },
          ]}
          actions={
            <>
              {catalog !== null ? (
                <div data-testid="library-count" className="inline-flex min-h-12 items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-2">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary-ink">
                    <Music2 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-ink">{plural(totalCount, t('common.songOne'), t('common.songMany'))}</span>
                </div>
              ) : null}
              {showHeaderAdd ? (
                <GroupButton onClick={() => setShowCreate(true)} disabled={songsAtLimit}>
                  {t('songs.addSong')}
                </GroupButton>
              ) : null}
            </>
          }
        >
          {!isOwner ? <p className="text-sm text-muted">{t('songs.readonly')}</p> : null}
        </GroupPageHeader>
      </div>

      {catalog !== null ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <label className="sr-only" htmlFor="library-search">{t('songs.searchSongs')}</label>
              <input id="library-search" type="search" data-testid="library-search" value={query}
                placeholder={t('songs.searchSongs')} onChange={(event) => { setQuery(event.target.value); setPage(1) }} className={`${groupFieldClass} pl-10`} maxLength={200} />
            </div>
            <div className="flex flex-wrap items-center gap-2 md:shrink-0">
              <GroupButton variant={favoritesOnly ? 'soft' : 'ghost'} aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly((value) => !value); setPage(1) }}>
                <Heart className="h-4 w-4" aria-hidden="true" fill={favoritesOnly ? 'currentColor' : 'none'} />
                {t('songs.tabFavorites')}
              </GroupButton>
              <GroupButton
                variant="secondary"
                aria-label={t('songs.moreOptions', { title: t('songs.pageTitle') })}
                aria-expanded={moreFiltersOpen}
                aria-controls="library-advanced-filters"
                onClick={() => setMoreFiltersOpen((open) => !open)}
                className="min-h-10 rounded-lg"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                {t('stage.moreOptions')}
              </GroupButton>
            </div>
          </div>
          <div id="library-advanced-filters" className={moreFiltersOpen ? 'flex flex-col gap-3 border-t border-border-subtle pt-3 sm:flex-row sm:flex-wrap sm:items-center' : 'hidden'}>
              <label className="flex min-h-11 min-w-36 items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 text-sm text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
                <span className="shrink-0">{t('songs.tabByTheme')}</span>
                <select aria-label={t('songs.tabByTheme')} className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-ink outline-none" value={theme} onChange={(event) => { setTheme(event.target.value); setPage(1) }}>
                  <option value="">{t('songs.tabAll')}</option>
                  {(catalog.availableTags ?? []).map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </label>
              <label htmlFor="library-sort" className="sr-only">{t('songs.sortLabel')}</label>
              <select id="library-sort" className={`${groupFieldClass} min-h-11 min-w-0 sm:w-auto sm:min-w-48`} value={sort} onChange={(event) => { const nextSort = event.target.value as LibrarySort; setSort(nextSort); setSortDirection(nextSort === 'recent' || nextSort === 'updated' ? 'desc' : 'asc'); setPage(1) }}>
                {sortOptions.map((option) => <option key={option.value} value={option.value}>{t('songs.sortLabel')}: {option.label}</option>)}
              </select>
              <GroupButton variant="secondary" aria-label={t(sortDirection === 'asc' ? 'songs.sortAscending' : 'songs.sortDescending')} title={t(sortDirection === 'asc' ? 'songs.sortAscending' : 'songs.sortDescending')} onClick={() => { setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); setPage(1) }}>
                {sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" aria-hidden="true" /> : <ArrowDown className="h-4 w-4" aria-hidden="true" />}
              </GroupButton>
          </div>
          {query.trim() || favoritesOnly || theme || sort !== 'recent' || sortDirection !== 'desc' ? (
            <div className="flex flex-wrap items-center gap-2" aria-label={t('songs.tabsLabel')}>
              {query.trim() ? <GroupChip>{query.trim()}</GroupChip> : null}
              {favoritesOnly ? <GroupChip>{t('songs.tabFavorites')}</GroupChip> : null}
              {theme ? <GroupChip>{theme}</GroupChip> : null}
              {sort !== 'recent' || sortDirection !== 'desc' ? <GroupChip>{t(LIBRARY_SORTS.find((item) => item.id === sort)!.labelKey)} · {t(sortDirection === 'asc' ? 'songs.sortAscending' : 'songs.sortDescending')}</GroupChip> : null}
              <GroupButton variant="ghost" onClick={() => { setQuery(''); setFavoritesOnly(false); setTheme(''); setSort('recent'); setSortDirection('desc'); setPage(1) }}>{t('tasks.clearFilters')}</GroupButton>
            </div>
          ) : null}
        </div>
      ) : null}
      {catalog !== null ? (
        <p role="status" aria-live="polite" aria-busy={isRefreshing} data-testid="library-results" className="text-sm text-muted">
          {t('songs.resultsRange', {
            first: totalCount ? (catalog.page - 1) * catalog.pageSize + 1 : 0,
            last: Math.min(catalog.page * catalog.pageSize, totalCount),
            total: totalCount,
          })}
          {isRefreshing ? <span className="ml-2">{t('songs.refreshing')}</span> : null}
        </p>
      ) : null}

      {listError ? <GroupErrorState message={listError} onRetry={() => setRefreshKey((current) => current + 1)} /> : null}

      <GroupLimitNotice
        label={t('plan.labelSongs')}
        metric={usage?.songs}
        upgradeHref={`${routes.groupSettings(group.id)}?tab=plan`}
      />

      {catalog === null ? (
        listError ? null : <GroupListSkeleton rows={4} label={t('songs.loadingSongs')} />
      ) : listError ? null : totalCount === 0 && !searching ? (
        <GroupEmptyState
          icon={Music2}
          title={t('songs.emptyTitle')}
          description={isOwner ? t('songs.emptyOwner') : t('songs.emptyMember')}
          action={
            isOwner ? (
              <GroupButton
                data-testid="library-empty-add-song"
                onClick={() => setShowCreate(true)}
                disabled={songsAtLimit}
              >
                {t('songs.addSong')}
              </GroupButton>
            ) : (
              <GroupLink variant="soft" to={routes.group(group.id)}>
                {t('songs.backHome')}
              </GroupLink>
            )
          }
        />
      ) : catalog.items.length === 0 ? (
        <GroupEmptyState
          title={favoritesOnly && !query.trim() && !theme ? t('songs.noFavoritesTitle') : t('setlists.noResultsTitle')}
          description={favoritesOnly && !query.trim() && !theme ? t('songs.noFavoritesBody') : t('setlists.noResultsBody')}
          action={
            <GroupButton variant="secondary" onClick={() => { setQuery(''); setFavoritesOnly(false); setTheme(''); setSort('recent'); setSortDirection('desc'); setPage(1) }}>
              {t('setlists.clearSearch')}
            </GroupButton>
          }
        />
      ) : (
        <div aria-busy={catalogIsStale}>
          <ul data-testid="library-list" className="divide-y divide-border-subtle border-y border-border-subtle">
            {catalog.items.map((song, index) => (
              <li
                key={song.id}
                className="library-enter group flex min-w-0 items-center gap-2 rounded-xl px-1 py-2 transition-colors hover:bg-surface-hover/60 sm:px-2 sm:py-3"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <AppLink
                  className="group flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left text-ink no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] sm:gap-4"
                  to={routes.groupSong(group.id, song.id)}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary-ink sm:h-12 sm:w-12">
                    <OriginMark kind={song.originKind} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-normal break-words font-semibold text-ink transition-colors group-hover:text-primary-ink">{song.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                      <span>{song.attribution || t('songs.unknownAttribution')}</span>
                      {song.genre ? <span aria-hidden="true">·</span> : null}
                      {song.genre ? <span>{song.genre}</span> : null}
                      {song.tags.slice(0, 2).map((tag) => <span key={tag}>· {tag}</span>)}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-sm text-muted tabular-nums xl:block">{new Date(song.updatedAt).toLocaleDateString(lang)}</span>
                  <span className="hidden max-w-48 shrink-0 truncate rounded-full bg-surface-hover px-2.5 py-1 text-xs text-muted sm:block" title={song.arrangementCount === 0 ? t('song.noArrangementsTitle') : plural(song.arrangementCount, t('song.versionsOne'), t('song.versionsMany'))}>
                    {song.arrangementCount === 0 ? t('song.noArrangementsTitle') : plural(song.arrangementCount, t('song.versionsOne'), t('song.versionsMany'))}
                  </span>
                </AppLink>
                <button
                  type="button"
                  aria-label={song.isFavorite ? t('songs.removeFavorite', { title: song.title }) : t('songs.addFavorite', { title: song.title })}
                  aria-pressed={song.isFavorite}
                  disabled={favoritePending.has(song.id)}
                  onClick={() => void toggleFavorite(song.id, !song.isFavorite)}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-primary-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] disabled:opacity-50"
                >
                  <Heart className="h-5 w-5" aria-hidden="true" fill={song.isFavorite ? 'currentColor' : 'none'} />
                </button>
                {isOwner ? <GroupActionMenu label={t('songs.moreOptions', { title: song.title })} items={[
                  { key: 'edit', label: t('song.editSong'), icon: Pencil, onSelect: () => void openSongEditor(song.id) },
                ]} /> : null}
              </li>
            ))}
          </ul>
          {catalog.totalPages > 1 ? (
            <nav aria-label={t('songs.pagination')} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
              <span className="text-sm text-muted">
                {t('songs.pageStatus', { page: catalog.page, pages: catalog.totalPages })}
              </span>
              <div className="flex gap-2">
                <GroupButton variant="secondary" size="icon" disabled={catalog.page <= 1} aria-label={t('songs.previousPage')} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </GroupButton>
                <GroupButton variant="secondary" size="icon" disabled={catalog.page >= catalog.totalPages} aria-label={t('songs.nextPage')} onClick={() => setPage((current) => Math.min(catalog.totalPages, current + 1))}>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </GroupButton>
              </div>
            </nav>
          ) : null}
        </div>
      )}

      {isOwner && showCreate ? (
        <CreateSongDialog
          groupId={group.id}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            setRefreshKey((current) => current + 1)
            void reloadUsage()
          }}
        />
      ) : null}
      {isOwner && editingSong ? (
        <SongEditDialog
          groupId={group.id}
          song={editingSong}
          onClose={() => setEditingSong(null)}
          onSaved={() => {
            setEditingSong(null)
            setRefreshKey((current) => current + 1)
          }}
        />
      ) : null}
      {editError ? <GroupErrorState message={editError} onRetry={() => setEditError(null)} /> : null}
    </section>
  )
}

function SongEditDialog({
  groupId,
  song,
  onClose,
  onSaved,
}: {
  groupId: string
  song: SongDetail
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useT()
  const [latestSong, setLatestSong] = useState<SongDetail | null>(null)
  const [dirty, setDirty] = useState(false)

  return (
    <GroupDialog
      open
      onClose={onClose}
      title={t('song.editSong')}
      description={song.title}
      confirmDiscard={dirty}
      size="sm"
      footer={null}
    >
      {(requestClose) => (
        <SongEditForm
          song={song}
          groupId={groupId}
          onCancel={requestClose}
          onSaved={async () => onSaved()}
          onConflict={async () => setLatestSong(await getSong(groupId, song.id))}
          latestSong={latestSong}
          onDirtyChange={setDirty}
        />
      )}
    </GroupDialog>
  )
}
