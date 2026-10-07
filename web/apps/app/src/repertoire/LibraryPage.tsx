import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, Library, MoreVertical, Music2 } from 'lucide-react'
import { listSongs, type CurrentUser, type SongListItem } from '../api/client'
import { useT, type I18nKey } from '../i18n'
import { cn } from '../ui/cn'
import {
  GroupButton,
  GroupEmptyState,
  GroupErrorState,
  GroupIconButton,
  GroupLimitNotice,
  GroupLink,
  GroupListSkeleton,
  GroupPageHeader,
  GroupPageSkeleton,
  GroupSelect,
  groupFieldClass,
  limitReached,
  useGroupDataSignal,
} from '../groups/ui'
import { useGroupUsage } from '../groups/useGroupUsage'
import { CreateSongDialog } from '../groups/dialogs'
import { OriginBadge, OriginMark, ReadinessChip } from './chrome'
import { plural } from '../ui/plural'
import {
  canManageContentRole,
  mutationErrorMessage,
  useGroupContext,
} from './ui'

type LibraryTab = 'all' | 'favorites' | 'recent' | 'theme'
type LibrarySort = 'title' | 'artist' | 'recent' | 'updated'

const LIBRARY_TABS: { id: LibraryTab; labelKey: I18nKey }[] = [
  { id: 'all', labelKey: 'canciones.tabAll' },
  { id: 'favorites', labelKey: 'canciones.tabFavorites' },
  { id: 'recent', labelKey: 'canciones.tabRecent' },
  { id: 'theme', labelKey: 'canciones.tabByTheme' },
]

const LIBRARY_SORTS: { id: LibrarySort; labelKey: I18nKey }[] = [
  { id: 'title', labelKey: 'canciones.sortTitle' },
  { id: 'artist', labelKey: 'canciones.sortArtist' },
  { id: 'recent', labelKey: 'canciones.sortRecent' },
  { id: 'updated', labelKey: 'canciones.sortUpdated' },
]

export function LibraryPage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const { group, error: groupError, reload: reloadGroup } = useGroupContext(groupId, user.id)
  const [songs, setSongs] = useState<SongListItem[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<LibraryTab>('all')
  const [sort, setSort] = useState<LibrarySort>('title')
  const [contextMenuSongId, setContextMenuSongId] = useState<string | null>(null)
  const { t } = useT()

  const isOwner = canManageContentRole(group?.role)
  const { usage, reload: reloadUsage } = useGroupUsage(groupId)
  const songsAtLimit = limitReached(usage?.songs)

  const filtered = useMemo(() => {
    if (!songs) return songs
    const q = query.trim().toLowerCase()
    let list = songs
    if (tab === 'favorites') {
      list = list.filter((song) => song.isFavorite)
    } else if (tab === 'recent') {
      list = [...list]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 12)
    } else if (tab === 'theme') {
      list = [...list].sort((a, b) => (a.tags[0] ?? 'zzz').localeCompare(b.tags[0] ?? 'zzz'))
    }
    if (q) {
      list = list.filter(
        (song) =>
          song.title.toLowerCase().includes(q) ||
          (song.attribution ?? '').toLowerCase().includes(q) ||
          song.tags.some((tag) => tag.includes(q)),
      )
    }
    // Apply sorting
    if (sort === 'title') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title))
    } else if (sort === 'artist') {
      list = [...list].sort((a, b) => (a.attribution ?? '').localeCompare(b.attribution ?? ''))
    } else if (sort === 'recent') {
      list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    } else if (sort === 'updated') {
      list = [...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }
    return list
  }, [songs, query, tab, sort])

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
        setListError(mutationErrorMessage(err))
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
      setListError(mutationErrorMessage(err))
    }
  }

  // Live refresh when songs change elsewhere (creation dialog, other tab).
  useGroupDataSignal('songs', groupId, () => {
    void reloadSongs()
    void reloadUsage()
  })

  if (group === undefined) {
    return <GroupPageSkeleton label={t('canciones.loadingLibrary')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <GroupErrorState message={groupError} onRetry={() => void reloadGroup()} />
        <GroupLink variant="soft" to="/">
          {t('canciones.myGroups')}
        </GroupLink>
      </div>
    )
  }

  const sortOptions = LIBRARY_SORTS.map((item) => ({ value: item.id, label: t(item.labelKey) }))

  return (
    <section className="space-y-6" aria-labelledby="library-heading">
      <div data-testid="library-hero">
        <GroupPageHeader
          headingId="library-heading"
          icon={Library}
          title={t('canciones.pageTitle')}
          subtitle={t('canciones.pageSubtitle')}
          breadcrumb={[
            { to: `/groups/${group.id}`, label: group.name },
            { label: t('canciones.pageTitle') },
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
                  {t('canciones.addSong')}
                </GroupButton>
              ) : null}
            </>
          }
        >
          {!isOwner ? <p className="text-sm text-muted">{t('canciones.readonly')}</p> : null}
        </GroupPageHeader>
      </div>

      {songs !== null && songs.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('canciones.tabsLabel')}>
            {LIBRARY_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  'min-h-11 rounded-xl px-3 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                  tab === item.id ? 'bg-primary/15 text-primary-ink' : 'text-muted hover:bg-surface-hover',
                )}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
          <div className="min-w-40">
            <GroupSelect
              aria-label={t('canciones.sortLabel')}
              value={sort}
              options={sortOptions}
              onChange={(value) => setSort(value as LibrarySort)}
            />
          </div>
        </div>
      ) : null}

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
              className={groupFieldClass}
              maxLength={200}
            />
          </div>
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
        upgradeHref={`/groups/${group.id}/ajustes?tab=plan`}
      />

      {songs === null || filtered === null ? (
        <GroupListSkeleton rows={4} label={t('canciones.loadingSongs')} />
      ) : songs.length === 0 ? (
        <GroupEmptyState
          icon={Music2}
          title={t('canciones.emptyTitle')}
          description={isOwner ? t('canciones.emptyOwner') : t('canciones.emptyMember')}
          action={
            isOwner ? (
              <GroupButton
                data-testid="library-empty-add-song"
                onClick={() => setShowCreate(true)}
                disabled={songsAtLimit}
              >
                {t('canciones.addSong')}
              </GroupButton>
            ) : (
              <GroupLink variant="soft" to={`/groups/${group.id}`}>
                {t('canciones.backHome')}
              </GroupLink>
            )
          }
        />
      ) : filtered.length === 0 ? (
        <GroupEmptyState
          title={t('listas.noResultsTitle')}
          description={t('listas.noResultsBody')}
          action={
            <GroupButton variant="secondary" onClick={() => setQuery('')}>
              {t('listas.clearSearch')}
            </GroupButton>
          }
        />
      ) : (
        <div className="space-y-1">
          <div
            aria-hidden="true"
            className="hidden px-2 text-xs font-semibold uppercase tracking-wide text-muted sm:grid sm:grid-cols-[2.75rem_minmax(0,1fr)_auto_1.5rem] sm:items-center sm:gap-3"
          >
            <span />
            <span>{t('listas.colSong')}</span>
            <span>{t('listas.colOrigin')}</span>
            <span />
          </div>
          <ul className="space-y-1 sm:space-y-0 sm:divide-y sm:divide-border-subtle sm:rounded-2xl sm:border sm:border-border-subtle sm:bg-surface">
            {filtered.map((song, index) => (
              <li
                key={song.id}
                className="library-enter relative"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <Link
                  className="flex min-h-[44px] items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-3 py-2.5 no-underline shadow-sm transition duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] motion-reduce:transition-none sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none sm:first:rounded-t-2xl sm:last:rounded-b-2xl"
                  to={`/groups/${group.id}/songs/${song.id}`}
                  onContextMenu={(e: MouseEvent) => {
                    e.preventDefault()
                    setContextMenuSongId(song.id)
                  }}
                >
                  <OriginMark kind={song.originKind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{song.title}</span>
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
                  </span>
                  <OriginBadge kind={song.originKind} />
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                </Link>
                {isOwner ? (
                  <GroupIconButton
                    label={`Más opciones para ${song.title}`}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={(e: MouseEvent) => {
                      e.preventDefault()
                      setContextMenuSongId(song.id)
                    }}
                  >
                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                  </GroupIconButton>
                ) : null}
                {contextMenuSongId === song.id ? (
                  <SongContextMenu
                    song={song}
                    groupId={group.id}
                    isOwner={isOwner}
                    onClose={() => setContextMenuSongId(null)}
                    onAction={() => setContextMenuSongId(null)}
                  />
                ) : null}
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

function SongContextMenu({
  song,
  groupId,
  isOwner,
  onClose,
  onAction,
}: {
  song: SongListItem
  groupId: string
  isOwner: boolean
  onClose: () => void
  onAction: () => void
}) {
  const { t } = useT()

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div className="absolute right-2 top-8 z-50 min-w-48 rounded-xl border border-border-subtle bg-surface py-1 shadow-lg">
        <MenuItem
          label={t('canciones.ctxOpen')}
          onClick={() => {
            onAction()
            window.location.href = `/groups/${groupId}/songs/${song.id}`
          }}
        />
        {isOwner ? (
          <>
            <MenuItem
              label={t('canciones.ctxEdit')}
              onClick={() => {
                onAction()
                window.location.href = `/groups/${groupId}/songs/${song.id}/edit`
              }}
            />
            <MenuItem
              label={t('canciones.ctxAddToSetlist')}
              onClick={() => {
                onAction()
                window.location.href = `/groups/${groupId}/setlists?song=${song.id}`
              }}
            />
            <MenuItem
              label={t('canciones.ctxDuplicate')}
              onClick={() => {
                onAction()
                // TODO: implement duplicate
              }}
            />
            <MenuItem
              label={song.isFavorite ? t('canciones.ctxUnfavorite') : t('canciones.ctxFavorite')}
              onClick={() => {
                onAction()
                // TODO: implement favorite toggle
              }}
            />
            <MenuItem
              label={t('canciones.ctxAttach')}
              onClick={() => {
                onAction()
                // TODO: implement attach
              }}
            />
            <MenuItem
              label={t('canciones.ctxArchive')}
              onClick={() => {
                onAction()
                // TODO: implement archive
              }}
            />
            <div className="my-1 border-t border-border-subtle" />
            <MenuItem
              label={t('canciones.ctxDelete')}
              danger
              onClick={() => {
                onAction()
                // TODO: implement delete
              }}
            />
          </>
        ) : null}
      </div>
    </>
  )
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'block w-full px-3 py-2 text-left text-sm transition-colors',
        danger ? 'text-error-ink hover:bg-error/10' : 'text-ink hover:bg-surface-hover',
      )}
    >
      {label}
    </button>
  )
}
