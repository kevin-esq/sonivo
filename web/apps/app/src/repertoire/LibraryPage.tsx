import { routes } from '../routing/routes'
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Heart, Library, Music2, Search, SlidersHorizontal } from 'lucide-react'
import { searchSongs, setSongFavorite, type CurrentUser, type SongCatalogPage } from '../api/client'
import { useT, type I18nKey } from '../i18n'
import {
  GroupButton,
  GroupChip,
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
import { OriginBadge, OriginMark, ReadinessChip } from './chrome'
import { plural } from '../ui/plural'
import { AppLink } from '../routing/AppLink'
import { useGroupShell } from '../shell/GroupShellContext'
import {
  canManageContentRole,
  mutationErrorMessage,
  useGroupContext,
} from './ui'

type LibrarySort = 'title' | 'artist' | 'recent' | 'updated' | 'theme'
type SortDirection = 'asc' | 'desc'
const SONG_PAGE_SIZE = 25

const LIBRARY_SORTS: { id: LibrarySort; labelKey: I18nKey }[] = [
  { id: 'title', labelKey: 'songs.sortTitle' },
  { id: 'artist', labelKey: 'songs.sortArtist' },
  { id: 'recent', labelKey: 'songs.sortRecent' },
  { id: 'updated', labelKey: 'songs.sortUpdated' },
  { id: 'theme', labelKey: 'songs.tabByTheme' },
]

export function LibraryPage({ user }: { user: CurrentUser }) {
  const { groupId } = useGroupShell()
  const { group, error: groupError, reload: reloadGroup } = useGroupContext(groupId, user.id)
  const [catalog, setCatalog] = useState<SongCatalogPage | null>(null)
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [theme, setTheme] = useState('')
  const [sort, setSort] = useState<LibrarySort>('recent')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)
  const [favoritePending, setFavoritePending] = useState<Set<string>>(() => new Set())
  const [refreshKey, setRefreshKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { t } = useT()

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

  function selectSort(nextSort: LibrarySort) {
    if (sort === nextSort) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    } else {
      setSort(nextSort)
      setSortDirection(nextSort === 'recent' || nextSort === 'updated' ? 'desc' : 'asc')
    }
    setPage(1)
  }

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
    <section className="space-y-8 pb-16" aria-labelledby="library-heading">
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
                <ReadinessChip testId="library-count" tone="neutral">
                  {plural(totalCount, t('common.songOne'), t('common.songMany'))}
                </ReadinessChip>
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
          <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-3 sm:flex-row sm:items-center sm:p-4">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <label className="sr-only" htmlFor="library-search">{t('songs.searchSongs')}</label>
              <input id="library-search" type="search" data-testid="library-search" value={query}
                placeholder={t('songs.searchSongs')} onChange={(event) => { setQuery(event.target.value); setPage(1) }} className={`${groupFieldClass} pl-10`} maxLength={200} />
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap items-center gap-2" aria-label={t('songs.tabsLabel')}>
              <GroupButton variant={favoritesOnly ? 'primary' : 'secondary'} aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly((value) => !value); setPage(1) }}>
                <Heart className="mr-2 h-4 w-4" aria-hidden="true" fill={favoritesOnly ? 'currentColor' : 'none'} />
                {t('songs.tabFavorites')}
              </GroupButton>
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 text-sm text-muted">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                <span>{t('songs.tabByTheme')}</span>
                <select aria-label={t('songs.tabByTheme')} className="max-w-40 border-0 bg-transparent py-2 text-sm text-ink outline-none" value={theme} onChange={(event) => { setTheme(event.target.value); setPage(1) }}>
                  <option value="">{t('songs.tabAll')}</option>
                  {(catalog.availableTags ?? []).map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted md:hidden">
              <span>{t('songs.sortLabel')}</span>
              <select className={`${groupFieldClass} min-w-44`} value={sort} onChange={(event) => { const nextSort = event.target.value as LibrarySort; setSort(nextSort); setSortDirection(nextSort === 'recent' || nextSort === 'updated' ? 'desc' : 'asc'); setPage(1) }}>
                {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <GroupButton variant="secondary" aria-label={t(sortDirection === 'asc' ? 'songs.sortAscending' : 'songs.sortDescending')} onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}>
                {sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" aria-hidden="true" /> : <ArrowDown className="h-4 w-4" aria-hidden="true" />}
              </GroupButton>
            </label>
          </div>
          {favoritesOnly || theme || sort !== 'recent' || sortDirection !== 'desc' ? (
            <div className="flex flex-wrap items-center gap-2" aria-label={t('songs.tabsLabel')}>
              {favoritesOnly ? <GroupChip>{t('songs.tabFavorites')}</GroupChip> : null}
              {theme ? <GroupChip>{theme}</GroupChip> : null}
              {sort !== 'recent' || sortDirection !== 'desc' ? <GroupChip>{t(LIBRARY_SORTS.find((item) => item.id === sort)!.labelKey)} · {t(sortDirection === 'asc' ? 'songs.sortAscending' : 'songs.sortDescending')}</GroupChip> : null}
              <GroupButton variant="ghost" onClick={() => { setQuery(''); setFavoritesOnly(false); setTheme(''); setSort('recent'); setSortDirection('desc'); setPage(1) }}>{t('tasks.clearFilters')}</GroupButton>
            </div>
          ) : null}
        </div>
      ) : null}
      {catalog !== null && (searching || catalog.totalPages > 1) ? (
        <p role="status" aria-live="polite" aria-busy={isRefreshing} data-testid="library-results" className="text-sm text-muted">
          {totalCount === 0
            ? plural(0, t('common.resultOne'), t('common.resultMany'))
            : t('songs.resultsRange', {
                first: (catalog.page - 1) * catalog.pageSize + 1,
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
          title={t('setlists.noResultsTitle')}
          description={t('setlists.noResultsBody')}
          action={
            <GroupButton variant="secondary" onClick={() => { setQuery(''); setFavoritesOnly(false); setTheme(''); setSort('recent'); setSortDirection('desc'); setPage(1) }}>
              {t('setlists.clearSearch')}
            </GroupButton>
          }
        />
      ) : (
          <div aria-busy={catalogIsStale}>
          <div
            className="hidden overflow-hidden rounded-2xl border border-border-subtle border-b-transparent bg-surface md:block"
          >
            <table className="w-full table-fixed text-left text-sm">
              <thead className="border-b border-border-subtle bg-surface-hover text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" aria-sort={sort === 'title' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className="w-[24%] px-3 py-3"><SortHeader label={t('songs.tableSong')} active={sort === 'title'} direction={sortDirection} onClick={() => selectSort('title')} /></th>
                  <th scope="col" aria-sort={sort === 'artist' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className="w-[14%] px-3 py-3"><SortHeader label={t('songs.tableArtist')} active={sort === 'artist'} direction={sortDirection} onClick={() => selectSort('artist')} /></th>
                  <th scope="col" aria-sort={sort === 'theme' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className="w-[18%] px-3 py-3"><SortHeader label={t('songs.tableTags')} active={sort === 'theme'} direction={sortDirection} onClick={() => selectSort('theme')} /></th>
                  <th scope="col" className="w-[11%] px-3 py-3">{t('songs.tableOrigin')}</th>
                  <th scope="col" aria-sort={sort === 'recent' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className="w-[13%] px-3 py-3"><SortHeader label={t('songs.tableCreated')} active={sort === 'recent'} direction={sortDirection} onClick={() => selectSort('recent')} /></th>
                  <th scope="col" className="w-[14%] px-3 py-3">{t('songs.tableArrangements')}</th>
                  <th scope="col" className="w-[6%] px-2 py-3"><span className="sr-only">{t('songs.tabFavorites')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {catalog.items.map((song) => (
                  <tr key={song.id} className="transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <AppLink className="flex min-w-0 items-center gap-3 rounded-lg text-ink no-underline focus-visible:outline-2 focus-visible:outline-primary" to={routes.groupSong(group.id, song.id)}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-score-hover)] text-[var(--color-score-ink-soft)]"><OriginMark kind={song.originKind} /></span>
                        <span className="min-w-0 truncate font-semibold">{song.title}</span>
                      </AppLink>
                    </td>
                    <td className={`px-4 py-3 text-xs ${sort === 'artist' ? 'font-semibold text-ink' : 'text-muted'}`}>{song.attribution || t('songs.unknownAttribution')}</td>
                    <td className="px-4 py-3"><span className="flex flex-wrap gap-1">{song.tags.length ? song.tags.slice(0, 3).map((tag) => <span key={tag} className="max-w-28 truncate rounded-full bg-surface-hover px-2 py-1 text-xs text-muted">{tag}</span>) : <span className="text-muted">—</span>}</span></td>
                    <td className="px-4 py-3"><OriginBadge kind={song.originKind} /></td>
                    <td className="px-3 py-3 text-xs text-muted tabular-nums">{new Date(song.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-muted">{plural(song.arrangementCount, t('schedule.setlistArrangementsOne'), t('schedule.setlistArrangementsMany'))}</td>
                    <td className="px-3 py-2"><FavoriteButton song={song} pending={favoritePending.has(song.id)} onToggle={() => void toggleFavorite(song.id, !song.isFavorite)} label={song.isFavorite ? t('songs.removeFavorite', { title: song.title }) : t('songs.addFavorite', { title: song.title })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {catalog.items.map((song, index) => (
              <li
                key={song.id}
                className="library-enter relative"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <div className="relative">
                  <AppLink
                  className="group flex min-h-20 items-center gap-3 rounded-xl border border-border-subtle bg-surface p-3 pr-14 no-underline transition duration-150 hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] motion-reduce:transition-none"
                    to={routes.groupSong(group.id, song.id)}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-score-hover)] text-[var(--color-score-ink-soft)]">
                      <OriginMark kind={song.originKind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-ink transition-colors group-hover:text-primary-ink">{song.title}</span>
                      {song.attribution ? <span className="block truncate text-sm text-muted">{song.attribution}</span> : null}
                      {song.tags.length > 0 ? (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {song.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-muted">{tag}</span>)}
                        </span>
                      ) : null}
                      <span className="mt-1 flex items-center justify-between gap-3 text-xs text-muted">
                        <OriginBadge kind={song.originKind} />
                        <span>{plural(song.arrangementCount, t('schedule.setlistArrangementsOne'), t('schedule.setlistArrangementsMany'))}</span>
                      </span>
                    </span>
                  </AppLink>
                  <button
                    type="button"
                    aria-label={song.isFavorite ? t('songs.removeFavorite', { title: song.title }) : t('songs.addFavorite', { title: song.title })}
                    aria-pressed={song.isFavorite}
                    disabled={favoritePending.has(song.id)}
                    onClick={() => void toggleFavorite(song.id, !song.isFavorite)}
                    className="absolute top-1/2 right-2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-primary-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] disabled:opacity-50"
                  >
                    <Heart className="h-5 w-5" aria-hidden="true" fill={song.isFavorite ? 'currentColor' : 'none'} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {catalog.totalPages > 1 ? (
            <nav aria-label={t('songs.pagination')} className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface p-3">
              <span className="text-sm text-muted">
                {t('songs.pageStatus', { page: catalog.page, pages: catalog.totalPages })}
              </span>
              <div className="flex gap-2">
                <GroupButton variant="secondary" disabled={catalog.page <= 1} aria-label={t('songs.previousPage')} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  {t('songs.previousPage')}
                </GroupButton>
                <GroupButton variant="secondary" disabled={catalog.page >= catalog.totalPages} aria-label={t('songs.nextPage')} onClick={() => setPage((current) => Math.min(catalog.totalPages, current + 1))}>
                  {t('songs.nextPage')}
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
    </section>
  )
}

function FavoriteButton({ song, pending, onToggle, label }: { song: SongCatalogPage['items'][number]; pending: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" aria-label={label} aria-pressed={song.isFavorite} disabled={pending} onClick={onToggle} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-primary-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
      <Heart className="h-5 w-5" aria-hidden="true" fill={song.isFavorite ? 'currentColor' : 'none'} />
    </button>
  )
}

function SortHeader({ label, active, direction, onClick }: { label: string; active: boolean; direction: SortDirection; onClick: () => void }) {
  const Icon = direction === 'asc' ? ArrowUp : ArrowDown
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md text-left font-semibold normal-case tracking-normal focus-visible:outline-2 focus-visible:outline-primary ${active ? 'text-primary-ink' : 'text-muted hover:text-ink'}`}>
      {label}
      {active ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
    </button>
  )
}
