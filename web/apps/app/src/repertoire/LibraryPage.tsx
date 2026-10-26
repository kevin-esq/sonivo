import { routes } from '../routing/routes'
import { GroupFilterPopover } from '../groups/ui/GroupFilterPopover'
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Library, Music2, Search } from 'lucide-react'
import { listSongs, type CurrentUser, type SongListItem } from '../api/client'
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

type LibraryTab = 'all' | 'favorites' | 'recent' | 'theme'
type LibrarySort = 'title' | 'artist' | 'recent' | 'updated' | 'theme'

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
  const [songs, setSongs] = useState<SongListItem[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [theme, setTheme] = useState('')
  const [sort, setSort] = useState<LibrarySort>('title')
  const { t } = useT()

  const isOwner = canManageContentRole(group?.role)
  const { usage, reload: reloadUsage } = useGroupUsage(groupId)
  const songsAtLimit = limitReached(usage?.songs)

  const filtered = useMemo(() => {
    if (!songs) return songs
    const q = query.trim().toLowerCase()
    let list = songs
    if (favoritesOnly) list = list.filter((song) => song.isFavorite)
    if (theme) list = list.filter((song) => song.tags.includes(theme))
    if (q) list = list.filter((song) => song.title.toLowerCase().includes(q))
    // Apply sorting
    if (sort === 'theme') {
      list = [...list].sort((a, b) => (a.tags[0] ?? '').localeCompare(b.tags[0] ?? '') || a.title.localeCompare(b.title))
    } else if (sort === 'title') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title))
    } else if (sort === 'artist') {
      list = [...list].sort((a, b) => (a.attribution ?? '').localeCompare(b.attribution ?? ''))
    } else if (sort === 'recent') {
      list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    } else if (sort === 'updated') {
      list = [...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }
    return list
  }, [songs, query, favoritesOnly, theme, sort])

  const searching = query.trim().length > 0

  const showHeaderAdd = isOwner && songs !== null && songs.length > 0

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
        setListError(mutationErrorMessage(err, t))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, group])

  async function reloadSongs() {
    if (!groupId) return
    setListError(null)
    try {
      setSongs(await listSongs(groupId))
    } catch (err) {
      setSongs([])
      setListError(mutationErrorMessage(err, t))
    }
  }

  // Live refresh when songs change elsewhere (creation dialog, other tab).
  useGroupDataSignal('songs', groupId, () => {
    void reloadSongs()
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
    <section className="space-y-8" aria-labelledby="library-heading">
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
              {songs !== null ? (
                <ReadinessChip testId="library-count" tone="neutral">
                  {plural(songs.length, t('common.songOne'), t('common.songMany'))}
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

      {songs !== null && songs.length > 0 ? (
        <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <label className="sr-only" htmlFor="library-search">{t('songs.titleSearch')}</label>
              <input id="library-search" type="search" data-testid="library-search" value={query}
                placeholder={t('songs.titleSearch')} onChange={(event) => setQuery(event.target.value)} className={`${groupFieldClass} pl-10`} maxLength={200} />
            </div>
            <GroupFilterPopover count={Number(favoritesOnly) + Number(Boolean(theme)) + Number(sort !== 'title')}>
              <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} />
                {t('songs.tabFavorites')}
              </label>
              <label className="space-y-1 text-sm text-muted"><span>{t('songs.tabByTheme')}</span>
                <select className={groupFieldClass} value={theme} onChange={(event) => setTheme(event.target.value)}>
                  <option value="">{t('songs.tabAll')}</option>
                  {[...new Set(songs.flatMap((song) => song.tags))].sort().map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm text-muted"><span>{t('songs.sortLabel')}</span>
                <select className={groupFieldClass} value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)}>
                  {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </GroupFilterPopover>
          </div>
          {favoritesOnly || theme || sort !== 'title' ? (
            <div className="flex flex-wrap items-center gap-2" aria-label={t('songs.tabsLabel')}>
              {favoritesOnly ? <GroupChip>{t('songs.tabFavorites')}</GroupChip> : null}
              {theme ? <GroupChip>{theme}</GroupChip> : null}
              {sort !== 'title' ? <GroupChip>{t(LIBRARY_SORTS.find((item) => item.id === sort)!.labelKey)}</GroupChip> : null}
              <GroupButton variant="ghost" onClick={() => { setFavoritesOnly(false); setTheme(''); setSort('title') }}>{t('tasks.clearFilters')}</GroupButton>
            </div>
          ) : null}
        </div>
      ) : null}
      {searching && filtered !== null ? (
        <p role="status" aria-live="polite" data-testid="library-results" className="text-sm text-muted">
          {plural(filtered.length, t('common.resultOne'), t('common.resultMany'))}
        </p>
      ) : null}

      <GroupErrorState message={listError} />

      <GroupLimitNotice
        label={t('plan.labelSongs')}
        metric={usage?.songs}
        upgradeHref={`${routes.groupSettings(group.id)}?tab=plan`}
      />

      {songs === null || filtered === null ? (
        <GroupListSkeleton rows={4} label={t('songs.loadingSongs')} />
      ) : songs.length === 0 ? (
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
      ) : filtered.length === 0 ? (
        <GroupEmptyState
          title={t('setlists.noResultsTitle')}
          description={t('setlists.noResultsBody')}
          action={
            <GroupButton variant="secondary" onClick={() => { setQuery(''); setFavoritesOnly(false); setTheme(''); setSort('title') }}>
              {t('setlists.clearSearch')}
            </GroupButton>
          }
        />
      ) : (
        <div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((song, index) => (
              <li
                key={song.id}
                className="library-enter relative"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <AppLink
                  className="group flex min-h-36 items-start gap-4 rounded-2xl border border-border-subtle bg-surface p-4 no-underline transition duration-150 hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] motion-reduce:transition-none sm:p-5"
                  to={routes.groupSong(group.id, song.id)}
                >
                  <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-score-hover)] text-[var(--color-score-ink-soft)]">
                    <OriginMark kind={song.originKind} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-ink transition-colors group-hover:text-primary-ink">{song.title}</span>
                    {song.attribution ? (
                      <span className="block truncate text-sm text-muted">{song.attribution}</span>
                    ) : null}
                    {song.tags.length > 0 ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {song.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-muted"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <span className="mt-3 flex items-center justify-between gap-3">
                      <OriginBadge kind={song.originKind} />
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </span>
                </AppLink>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOwner && showCreate ? (
        <CreateSongDialog
          groupId={group.id}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            void reloadSongs()
            void reloadUsage()
          }}
        />
      ) : null}
    </section>
  )
}
