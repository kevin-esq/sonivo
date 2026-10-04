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
import { useT, type I18nKey } from '../i18n'
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
  ReadinessChip,
} from './chrome'
import { plural } from '../ui/plural'
import {
  canManageContentRole,
  mutationErrorMessage,
  ProblemAlert,
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
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [songs, setSongs] = useState<SongListItem[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<LibraryTab>('all')
  const [sort, setSort] = useState<LibrarySort>('title')
  const { t } = useT()

  const isOwner = canManageContentRole(group?.role)

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
    return <PageSkeleton label={t('canciones.loadingLibrary')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="font-semibold text-primary-ink no-underline hover:underline" to="/">
          {t('canciones.myGroups')}
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
      <header data-testid="library-hero" className="space-y-3">
        <PageBreadcrumb items={[{ to: `/groups/${group.id}`, label: group.name }, { label: t('canciones.pageTitle') }]} />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 id="library-heading" className="text-3xl font-bold tracking-tight text-ink">
              {t('canciones.pageTitle')}
            </h1>
            <p className="max-w-lg text-sm text-muted">{t('canciones.pageSubtitle')}</p>
            {!isOwner ? <p className="text-sm text-muted">{t('canciones.readonly')}</p> : null}
          </div>
          {songs !== null ? (
            <ReadinessChip testId="library-count" tone="neutral">
              {plural(songs.length, t('common.songOne'), t('common.songMany'))}
            </ReadinessChip>
          ) : null}
        </div>
      </header>

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
          <div className="flex items-center gap-1">
            <label htmlFor="library-sort" className="sr-only">
              {t('canciones.sortLabel')}
            </label>
            <select
              id="library-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as LibrarySort)}
              className="min-h-11 rounded-xl border border-border-subtle bg-surface px-2 text-sm text-ink"
              aria-label={t('canciones.sortLabel')}
            >
              {LIBRARY_SORTS.map((item) => (
                <option key={item.id} value={item.id}>
                  {t(item.labelKey)}
                </option>
              ))}
            </select>
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
              className={cn(fieldClass, 'min-h-11')}
              maxLength={200}
            />
          </div>
          {showHeaderAdd ? <AddSongButton onClick={() => setShowCreate(true)} /> : null}
        </div>
      ) : null}
      {searching && filtered !== null ? (
        <p role="status" aria-live="polite" data-testid="library-results" className="text-sm text-muted">
          {plural(filtered.length, t('common.resultOne'), t('common.resultMany'))}
        </p>
      ) : null}

      <ProblemAlert message={listError} />

      {songs === null || filtered === null ? (
        <ListSkeleton rows={4} label={t('canciones.loadingSongs')} />
      ) : songs.length === 0 ? (
        showCreate ? null : (
        <EmptyPanel
          title={t('canciones.emptyTitle')}
          description={
            isOwner ? t('canciones.emptyOwner') : t('canciones.emptyMember')
          }
          action={
            isOwner ? (
              <Button data-testid="library-empty-add-song" onClick={() => setShowCreate(true)}>
                {t('canciones.addSong')}
              </Button>
            ) : (
              <Link
                className="font-semibold text-primary-ink no-underline hover:underline"
                to={`/groups/${group.id}`}
              >
                {t('canciones.backHome')}
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
                className="library-enter"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <Link
                  className="flex min-h-[44px] items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-3 py-2.5 no-underline shadow-sm transition duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] motion-reduce:transition-none sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none sm:first:rounded-t-2xl sm:last:rounded-b-2xl"
                  to={`/groups/${group.id}/songs/${song.id}`}
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
  const [tags, setTags] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { t } = useT()

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
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      })
      await onCreated()
    } catch (err) {
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="max-w-lg space-y-4 border-t border-border-subtle pt-6" onSubmit={onSubmit} noValidate>
      <h2 className="text-lg font-semibold">{t('canciones.createTitle')}</h2>
      <ProblemAlert message={error} />
      <Field label={t('canciones.titleLabel')}>
        <input
          className={fieldClass}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label={t('canciones.originLabel')}>
        <select
          className={fieldClass}
          required
          value={originKind}
          onChange={(e) => setOriginKind(e.target.value as SongOriginKind)}
        >
          <option value="original">{t('canciones.originOriginal')}</option>
          <option value="cover">{t('canciones.originCover')}</option>
          <option value="other">{t('canciones.originOther')}</option>
        </select>
      </Field>
      <Field label={t('canciones.attributionLabel')}>
        <input
          className={fieldClass}
          value={attribution}
          onChange={(e) => setAttribution(e.target.value)}
          maxLength={500}
        />
      </Field>
      <Field label={t('canciones.tagsLabel')}>
        <input
          className={fieldClass}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          maxLength={200}
          placeholder={t('canciones.tagsPlaceholder')}
        />
      </Field>
      <Field label={t('canciones.rightsLabel')}>
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
          {pending ? t('canciones.creating') : t('canciones.create')}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          {t('canciones.cancel')}
        </Button>
      </FormActions>
    </form>
  )
}
