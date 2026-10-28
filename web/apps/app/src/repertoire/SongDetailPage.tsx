import { routes } from '../routing/routes'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, ChevronRight, Paperclip, Pause, Play, Search } from 'lucide-react'
import {
  createArrangement,
  deleteSong,
  getArrangement,
  getSong,
  isConflictError,
  listArrangements,
  resourceContentUrl,
  updateSong,
  type CurrentUser,
  type ResourceSummary,
  type SongDetail,
  type SongOriginKind,
} from '../api/client'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { safeExternalResourceUrl } from './resourceUrl'
import { fieldClass } from '../ui/field'
import { GroupButton, GroupDialog, GroupInput, groupFieldClass } from '../groups/ui'
import {
  EmptyPanel,
  Field,
  FormActions,
  OriginBadge,
  OriginMark,
  PageBreadcrumb,
  ReadinessChip,
} from './chrome'
import {
  ConfirmDialog,
  ConflictAlert,
  formatOriginKind,
  canManageContentRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from './ui'
import { plural } from '../ui/plural'
import { useAction } from '../hooks/useAction'
import { useResource } from '../hooks/useResource'
import { useT, type I18nKey } from '../i18n'
import { AppLink } from '../routing/AppLink'
import { useGroupShell } from '../shell/GroupShellContext'

import { SongContentGuide } from './SongContentGuide'
import { RehearsalBodyView } from './ChordProView'
import { useAudioPlayer } from './AudioPlayerContext'
import { isPlayableAudioResource } from './pickPracticeAudio'

type SongTab = 'lyrics' | 'chords' | 'notes' | 'files'

const SONG_TABS: { id: SongTab; labelKey: I18nKey }[] = [
  { id: 'lyrics', labelKey: 'song.tabLyrics' },
  { id: 'chords', labelKey: 'song.tabChords' },
  { id: 'notes', labelKey: 'song.tabNotes' },
  { id: 'files', labelKey: 'song.tabFiles' },
]

export function SongDetailPage({ user, groupId, songId }: { user: CurrentUser; groupId: string; songId: string }) {
  const { navigate, search } = useGroupShell()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [conflict, setConflict] = useState<string | null>(null)
  const [latestSong, setLatestSong] = useState<SongDetail | null>(null)
  const [editing, setEditing] = useState(false)
  const [creatingArrangement, setCreatingArrangement] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [tab, setTab] = useState<SongTab>('lyrics')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [pickedArrangementId, setPickedArrangementId] = useState<string | null>(null)
  const [selectingArrangement, setSelectingArrangement] = useState(false)
  const [arrangementQuery, setArrangementQuery] = useState('')
  const { t } = useT()
  const audioPlayer = useAudioPlayer()

  const isOwner = canManageContentRole(group?.role)
  const editRequested = new URLSearchParams(search).get('edit') === 'true'

  // Song + arrangement list load together; stays idle until the group is known.
  const surface = useResource(
    group && groupId && songId
      ? async () => {
          const [song, arrangements] = await Promise.all([
            getSong(groupId!, songId!),
            listArrangements(groupId!, songId!),
          ])
          return { song, arrangements }
        }
      : null,
    [groupId, songId, group],
  )

  const arrangements = surface.data?.arrangements ?? []
  const filteredArrangements = useMemo(() => {
    const query = arrangementQuery.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()
    if (!query) return arrangements
    return arrangements.filter((arrangement) => {
      const searchable = [arrangement.label, arrangement.defaultKey, arrangement.defaultBpm]
        .filter((value) => value != null)
        .join(' ')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLocaleLowerCase()
      return searchable.includes(query)
    })
  }, [arrangements, arrangementQuery])

  useEffect(() => {
    if (editRequested && surface.data && isOwner) setEditing(true)
  }, [editRequested, surface.data, isOwner])
  const selectedArrangementId =
    arrangements.find((item) => item.id === pickedArrangementId)?.id ??
    (arrangements.length === 1 ? arrangements[0]?.id : undefined) ??
    null

  // Selected arrangement content (lyrics/chords/notes/resources) for the tabs.
  const detail = useResource(
    group && groupId && selectedArrangementId
      ? () => getArrangement(groupId!, selectedArrangementId)
      : null,
    [groupId, selectedArrangementId],
  )

  const remove = useAction(async () => {
    const target = surface.data?.song
    if (!groupId || !songId || !target) return
    setConflict(null)
    try {
      await deleteSong(groupId, songId, target.version)
      setConfirmDelete(false)
      setDeleteConfirmation('')
      navigate(routes.groupLibrary(groupId))
    } catch (err) {
      setConfirmDelete(false)
      setDeleteConfirmation('')
      if (isConflictError(err)) {
        setConflict(t('common.errorConflict'))
        surface.reload()
        return
      }
      throw err
    }
  })

  if (group === undefined) {
    return <p aria-live="polite">{t('song.loading')}</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <AppLink className="font-semibold text-primary-ink no-underline hover:underline" to={routes.home}>
          {t('song.myGroups')}
        </AppLink>
      </div>
    )
  }

  const loaded = surface.data
  if (loaded === undefined) {
    if (surface.error == null) {
      return <p aria-live="polite">{t('song.loading')}</p>
    }
    return (
      <div className="space-y-3">
        <ProblemAlert message={mutationErrorMessage(surface.error, t)} />
        <AppLink
          className="font-semibold text-primary-ink no-underline hover:underline"
          to={routes.groupLibrary(group.id)}
        >
          {t('song.library')}
        </AppLink>
      </div>
    )
  }

  const { song } = loaded

  function exitEditing() {
    setLatestSong(null)
    setEditing(false)
    if (!editRequested) return
    const params = new URLSearchParams(search)
    params.delete('edit')
    const query = params.toString()
    navigate(`${routes.groupSong(groupId, songId)}${query ? `?${query}` : ''}`, { replace: true })
  }
  const selectedArrangement =
    arrangements.find((item) => item.id === selectedArrangementId) ?? null
  const arrangementDetail = detail.data
  const deleteError = remove.error != null ? mutationErrorMessage(remove.error, t) : null

  const showAddArrangement = isOwner

  const arrangementCountLabel =
    song.arrangementCount === 0
      ? t('setlists.noArrangements')
      : plural(
          song.arrangementCount,
          t('song.versionsOne'),
          t('song.versionsMany'),
        )

  const tabContent: Record<SongTab, string | null> = {
    lyrics: arrangementDetail?.lyrics ?? null,
    chords: arrangementDetail?.chords ?? null,
    notes: arrangementDetail?.notes ?? null,
    files: null,
  }

  const emptyKey: Record<SongTab, I18nKey> = {
    lyrics: 'song.noLyrics',
    chords: 'song.noChords',
    notes: 'song.noNotes',
    files: 'song.noRelatedFiles',
  }

  const resources: ResourceSummary[] = arrangementDetail?.resources ?? []
  const showSongFacts = Boolean(song.attribution?.trim() || song.genre?.trim() || song.rightsNotes?.trim() || song.tags.length)

  return (
      <section className="space-y-7" aria-labelledby="song-heading">
      <header data-testid="song-hero" className="sonivo-score-header space-y-4">
        <PageBreadcrumb
          items={[
            { to: routes.group(group.id), label: group.name },
            { to: routes.groupLibrary(group.id), label: t('songs.pageTitle') },
            { label: song.title },
          ]}
        />
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
          <OriginMark kind={song.originKind} />
          <div className="min-w-0 flex-1 space-y-2">
            <h1 id="song-heading" className="sonivo-page-title text-[var(--color-score-ink)]">
              {song.title}
            </h1>
            {song.attribution || !isOwner ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-score-muted)]">
                {song.attribution ? <span>{song.attribution}</span> : null}
                {!isOwner ? <span>{t('song.readonly')}</span> : null}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <OriginBadge kind={song.originKind} />
              <ReadinessChip
                testId="song-readiness"
                tone={song.arrangementCount === 0 ? 'warn' : 'ok'}
              >
                {arrangementCountLabel}
              </ReadinessChip>
            </div>
          </div>
          <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:col-span-1">
            {selectedArrangement ? (
              <AppLink className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary-strong px-4 text-sm font-semibold text-primary-foreground no-underline shadow-sm hover:bg-primary-strong/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" to={routes.groupPractice(group.id, selectedArrangement.id)}>
                {t('song.practiceArrangement')}
              </AppLink>
            ) : null}
            {isOwner && !editing ? (
              <Button variant="secondary" onClick={() => { setLatestSong(null); setEditing(true) }}>
                {t('song.editSong')}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <ProblemAlert message={deleteError} />
      <ConflictAlert message={conflict} />

      {editing && isOwner ? (
        <section
          data-testid="song-edit-form"
          aria-label={t('song.editSong')}
          className="rounded-2xl border border-border-subtle bg-surface p-5 sm:p-6"
        >
          <SongEditForm
            song={song}
            groupId={group.id}
            onCancel={exitEditing}
            onSaved={async () => {
              exitEditing()
              setConflict(null)
              surface.reload()
            }}
            onConflict={async () => {
              setConflict(t('common.errorConflict'))
              try {
                setLatestSong(await getSong(group.id, song.id))
              } catch {
                setConflict(t('song.conflictReloadFailed'))
              }
            }}
            latestSong={latestSong}
          />
        </section>
      ) : null}

      <section className="min-w-0 space-y-3" aria-labelledby="arrangements-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h2 id="arrangements-heading" className="text-lg font-semibold">
                {t('song.arrangementsTitle')}
              </h2>
              <SongContentGuide />
            </div>
            <p className="mt-1 text-sm text-muted">{t('song.arrangementsHint')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {arrangements.length > 1 ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setArrangementQuery('')
                  setSelectingArrangement(true)
                }}
                aria-haspopup="dialog"
                aria-expanded={selectingArrangement}
                data-testid="song-open-arrangement-picker"
              >
                {selectedArrangement ? t('song.changeVersion') : t('song.chooseVersion')}
                <ChevronRight className="ml-1 h-4 w-4 rotate-90" aria-hidden="true" />
              </Button>
            ) : null}
            {showAddArrangement ? (
              <Button onClick={() => setCreatingArrangement(true)}>{t('song.addArrangement')}</Button>
            ) : null}
          </div>
        </div>
        {arrangements.length === 0 ? (
          <EmptyPanel
            title={t('song.noArrangementsTitle')}
            description={t(showAddArrangement ? 'song.noArrangementsBody' : 'song.noArrangementsMemberBody')}
          />
        ) : selectedArrangement ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border-subtle bg-surface px-4 py-3">
            <span className="min-w-0 flex-1 break-words font-semibold text-ink [overflow-wrap:anywhere]">
              {selectedArrangement.label}
            </span>
            <span className="shrink-0 rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-primary-ink">
              {t('song.versionSelected')}
            </span>
            <span className="w-full text-sm text-muted sm:w-auto">
              {[
                selectedArrangement.defaultKey ? `${t('song.infoKey')}: ${selectedArrangement.defaultKey}` : null,
                selectedArrangement.defaultBpm != null ? `${t('song.infoTempo')}: ${selectedArrangement.defaultBpm}` : null,
              ].filter(Boolean).join(' · ') || t('song.noKeyTempo')}
            </span>
          </div>
        ) : null}

        {isOwner && creatingArrangement ? (
          <ArrangementCreateForm
            groupId={group.id}
            songId={song.id}
            onCancel={() => setCreatingArrangement(false)}
            onCreated={async (createdId) => {
              setCreatingArrangement(false)
              navigate(routes.groupArrangement(group.id, createdId))
            }}
          />
        ) : null}
      </section>

      <GroupDialog
        open={selectingArrangement}
        onClose={() => setSelectingArrangement(false)}
        title={t('song.chooseVersionTitle')}
        description={t('song.chooseVersionDescription')}
        size="sm"
        mobileFullscreen
        testId="song-arrangement-picker"
      >
        <div className="space-y-3">
          <label className="sr-only" htmlFor="song-arrangement-search">{t('song.searchVersions')}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              id="song-arrangement-search"
              type="search"
              autoComplete="off"
              value={arrangementQuery}
              onChange={(event) => setArrangementQuery(event.target.value)}
              placeholder={t('song.searchVersions')}
              className={`${groupFieldClass} pl-10`}
              data-autofocus
              data-testid="song-arrangement-search"
            />
          </div>
          {filteredArrangements.length ? (
            <ul className="max-h-[55dvh] space-y-2 overflow-y-auto overscroll-contain pr-1">
              {filteredArrangements.map((arrangement) => {
                const isSelected = arrangement.id === selectedArrangementId
                const keyAndTempo = [
                  arrangement.defaultKey ? `${t('song.infoKey')}: ${arrangement.defaultKey}` : null,
                  arrangement.defaultBpm != null ? `${t('song.infoTempo')}: ${arrangement.defaultBpm}` : null,
                ].filter(Boolean).join(' · ')
                return (
                  <li key={arrangement.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={t('song.selectArrangement', { label: arrangement.label })}
                      data-testid={`song-arrangement-select-${arrangement.id}`}
                      onClick={() => {
                        setPickedArrangementId(arrangement.id)
                        setSelectingArrangement(false)
                      }}
                      className={cn(
                        'flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl border border-border-subtle px-3 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] motion-reduce:transition-none',
                        isSelected ? 'bg-surface-hover' : 'bg-surface',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-semibold text-ink [overflow-wrap:anywhere]">{arrangement.label}</span>
                        <span className="block text-sm text-muted">{keyAndTempo || t('song.noKeyTempo')}</span>
                      </span>
                      {isSelected ? (
                        <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary-ink">
                          <Check className="h-4 w-4" aria-hidden="true" />
                          {t('song.versionSelected')}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p role="status" className="rounded-xl bg-surface-hover px-4 py-6 text-center text-sm text-muted">
              {t('song.noVersionSearchResults')}
            </p>
          )}
        </div>
      </GroupDialog>

      <section className="min-w-0 space-y-4" aria-labelledby="song-materials-heading">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 id="song-materials-heading" className="break-words text-lg font-semibold text-ink [overflow-wrap:anywhere]">
                  {selectedArrangement?.label ?? t('song.tabsLabel')}
                </h2>
                {selectedArrangement ? (
                  <p className="mt-1 text-sm text-muted">{t('song.versionMaterialsHint')}</p>
                ) : null}
              </div>
              {selectedArrangement ? (
                <AppLink
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface px-4 text-sm font-semibold text-ink no-underline hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)]"
                  to={routes.groupArrangement(group.id, selectedArrangement.id)}
                >
                  {t(isOwner ? 'song.editArrangementContent' : 'song.openArrangement')}
                  <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </AppLink>
              ) : null}
            </div>

              <div
                role="tablist"
                aria-label={t('song.tabsLabel')}
                className="grid w-full flex-1 grid-cols-2 gap-1 rounded-xl bg-surface-hover p-1 sm:grid-cols-4"
              >
                {SONG_TABS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    id={`song-tab-${option.id}`}
                    aria-selected={tab === option.id}
                    aria-controls={`song-panel-${option.id}`}
                    aria-setsize={SONG_TABS.length}
                    aria-posinset={SONG_TABS.findIndex((item) => item.id === option.id) + 1}
                    tabIndex={tab === option.id ? 0 : -1}
                    data-testid={`song-tab-${option.id}`}
                    data-tab-surface="score"
                    ref={(element) => { tabRefs.current[SONG_TABS.findIndex((item) => item.id === option.id)] = element }}
                    onClick={() => setTab(option.id)}
                    onKeyDown={(event) => {
                      const currentIndex = SONG_TABS.findIndex((item) => item.id === option.id)
                      let nextIndex: number | null = null
                      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % SONG_TABS.length
                      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + SONG_TABS.length) % SONG_TABS.length
                      if (event.key === 'Home') nextIndex = 0
                      if (event.key === 'End') nextIndex = SONG_TABS.length - 1
                      if (nextIndex === null) return
                      event.preventDefault()
                      const nextTab = SONG_TABS[nextIndex]
                      if (!nextTab) return
                      setTab(nextTab.id)
                      tabRefs.current[nextIndex]?.focus()
                    }}
                    className={cn(
                      'sonivo-tab-trigger',
                      tab === option.id ? '' : 'text-muted hover:text-ink',
                    )}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>

            <div
              role="tabpanel"
              id={`song-panel-${tab}`}
              aria-labelledby={`song-tab-${tab}`}
              data-testid="song-tabpanel"
              className="min-h-72 rounded-2xl border border-border-subtle bg-surface p-5 sm:p-8"
            >
              {!selectedArrangement ? (
                <p className="text-sm text-muted">{arrangements.length > 1 ? t('song.chooseArrangementForContent') : t('song.noArrangementForTabs')}</p>
              ) : detail.loading ? (
                <p aria-live="polite" className="text-sm text-muted">
                  {t('song.loadingArrangements')}
                </p>
              ) : detail.error != null ? (
                <div className="space-y-3" role="alert">
                  <p className="text-sm text-error-ink">{t('song.contentLoadError')}</p>
                  <Button type="button" variant="secondary" onClick={detail.reload}>{t('state.retry')}</Button>
                </div>
              ) : tab === 'files' ? (
                resources.length === 0 ? (
                  <p className="text-sm text-muted">{t('song.noRelatedFiles')}</p>
                ) : (
                  <ul className="space-y-2">
                    {resources.map((resource) => {
                      const href = resource.kind === 'link'
                        ? safeExternalResourceUrl(resource.url)
                        : resourceContentUrl(group.id, selectedArrangement.id, resource.id)
                      const content = (
                        <>
                          <Paperclip className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink">
                              {resource.label}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {resource.originalFileName ?? resource.url ?? resource.kind}
                            </span>
                          </span>
                        </>
                      )
                      const playable = isPlayableAudioResource(resource) && Boolean(href)
                      const isCurrentTrack = audioPlayer.currentTrack?.id === resource.id
                      const playResource = () => {
                        if (!href || !playable) return
                        if (isCurrentTrack) {
                          audioPlayer.togglePlay()
                        } else {
                          audioPlayer.playTrack({ id: resource.id, title: resource.label, artist: song.attribution ?? undefined, url: href })
                        }
                      }
                      return (
                        <li key={resource.id} className="flex items-center gap-2">
                          {href ? (
                            <a className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl border border-border-subtle px-3 py-2 no-underline hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href={href} target="_blank" rel="noopener noreferrer">
                              {content}
                            </a>
                          ) : (
                            <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl border border-border-subtle px-3 py-2" aria-disabled="true">{content}</div>
                          )}
                          {playable ? (
                            <Button variant="secondary" aria-label={t(isCurrentTrack && audioPlayer.isPlaying ? 'player.pauseTrack' : 'player.playTrack', { title: resource.label })} onClick={playResource}>
                              {isCurrentTrack && audioPlayer.isPlaying ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                            </Button>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )
              ) : tabContent[tab]?.trim() && (tab === 'lyrics' || tab === 'chords') ? (
                <RehearsalBodyView
                  text={tabContent[tab]!}
                  chordProTestId={`song-${tab}-chordpro`}
                  plainTestId={`song-${tab}-plain`}
                  hideChords={tab === 'lyrics'}
                />
              ) : tabContent[tab]?.trim() ? (
                <pre className="max-w-full overflow-x-auto whitespace-pre-wrap font-sans text-sm text-ink">
                  {tabContent[tab]}
                </pre>
              ) : (
                <p className="text-sm text-muted">{t(emptyKey[tab])}</p>
              )}
            </div>
      </section>

      {!editing && showSongFacts ? (
        <section data-testid="song-facts" aria-labelledby="song-facts-heading" className="space-y-3 border-t border-border-subtle pt-5">
          <h2 id="song-facts-heading" className="text-base font-semibold text-ink">{t('song.infoTitle')}</h2>
          <dl className="grid min-w-0 gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted">{t('song.originLabel')}</dt>
              <dd className="mt-1 font-medium">{formatOriginKind(song.originKind, t)}</dd>
            </div>
            {song.attribution ? (
              <div>
                <dt className="text-muted">{t('songs.attributionLabel')}</dt>
                <dd className="mt-1 break-words font-medium">{song.attribution}</dd>
              </div>
            ) : null}
            {song.genre ? (
              <div>
                <dt className="text-muted">{t('songCreate.wizardGenre')}</dt>
                <dd className="mt-1 break-words font-medium">{song.genre}</dd>
              </div>
            ) : null}
            {song.tags.length > 0 ? (
              <div>
                <dt className="text-muted">{t('song.infoTags')}</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {song.tags.map((tag) => <span key={tag} className="rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-ink">{tag}</span>)}
                </dd>
              </div>
            ) : null}
            {song.rightsNotes ? (
              <div className="sm:col-span-2 lg:col-span-4">
                <dt className="text-muted">{t('song.rightsLabel')}</dt>
                <dd className="mt-1 whitespace-pre-wrap font-medium">{song.rightsNotes}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {isOwner ? (
        <section
          aria-labelledby="song-danger-heading"
          data-testid="danger-zone"
          className="space-y-4 rounded-2xl border border-error/50 bg-error/5 p-5 sm:p-6"
        >
          <h2 id="song-danger-heading" className="text-lg font-semibold text-error-ink">
            {t('common.dangerZone')}
          </h2>
          <p className="max-w-2xl text-sm text-muted">{t('song.deleteZoneHint')}</p>
          <Button variant="danger" onClick={() => { setDeleteConfirmation(''); setConfirmDelete(true) }}>
            {t('song.deleteSong')}
          </Button>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        title={t('song.deleteTitle')}
        confirmLabel={t('song.deleteSong')}
        cancelLabel={t('song.cancel')}
        pendingLabel={t('song.deleting')}
        pending={remove.pending}
        confirmDisabled={deleteConfirmation !== song.title}
        onCancel={() => { setConfirmDelete(false); setDeleteConfirmation('') }}
        onConfirm={() => { if (deleteConfirmation === song.title) void remove.run() }}
      >
        <p>{t('song.deleteBody')}</p>
        <p>{t('song.deleteConfirmInstruction', { title: song.title })}</p>
        <label className="block space-y-1 text-sm font-medium text-ink" htmlFor="delete-song-confirmation">
          <span>{t('song.deleteConfirmLabel')}</span>
          <input
            id="delete-song-confirmation"
            className={fieldClass}
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
      </ConfirmDialog>
    </section>
  )
}

export function SongEditForm({
  song,
  groupId,
  onCancel,
  onSaved,
  onConflict,
  latestSong,
  onDirtyChange,
}: {
  song: SongDetail
  groupId: string
  onCancel: () => void
  onSaved: (song: SongDetail) => Promise<void>
  onConflict: () => Promise<void>
  latestSong: SongDetail | null
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [title, setTitle] = useState(song.title)
  const [originKind, setOriginKind] = useState<SongOriginKind>(song.originKind as SongOriginKind)
  const [attribution, setAttribution] = useState(song.attribution ?? '')
  const [genre, setGenre] = useState(song.genre ?? '')
  const [rightsNotes, setRightsNotes] = useState(song.rightsNotes ?? '')
  const [tags, setTags] = useState(song.tags.join(', '))
  const [reviewedLatest, setReviewedLatest] = useState(false)
  const { t } = useT()

  useEffect(() => {
    onDirtyChange?.(
      title !== song.title ||
      originKind !== song.originKind ||
      attribution !== (song.attribution ?? '') ||
      genre !== (song.genre ?? '') ||
      rightsNotes !== (song.rightsNotes ?? '') ||
      tags !== song.tags.join(', '),
    )
  }, [title, originKind, attribution, genre, rightsNotes, tags, song, onDirtyChange])

  useEffect(() => setReviewedLatest(false), [latestSong?.version])

  const save = useAction(async () => {
    try {
      const updated = await updateSong(groupId, song.id, {
        expectedVersion: latestSong?.version ?? song.version,
        title: title.trim(),
        originKind,
        attribution,
        genre: genre.trim() || null,
        rightsNotes,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      })
      await onSaved(updated)
    } catch (err) {
      if (isConflictError(err)) {
        await onConflict()
        return
      }
      throw err
    }
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        void save.run()
      }}
      noValidate
    >
      <h3 className="font-semibold">{t('song.editSong')}</h3>
      {latestSong ? (
        <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm" role="status">
          <p className="font-semibold text-ink">{t('song.latestVersionAvailable')}</p>
          <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
            <dt className="text-muted">{t('songs.titleLabel')}</dt><dd className="break-words font-medium">{latestSong.title}</dd>
            <dt className="text-muted">{t('songs.attributionLabel')}</dt><dd className="break-words">{latestSong.attribution || '—'}</dd>
            <dt className="text-muted">{t('songCreate.wizardGenre')}</dt><dd className="break-words">{latestSong.genre || '—'}</dd>
            <dt className="text-muted">{t('songs.rightsLabel')}</dt><dd className="whitespace-pre-wrap break-words">{latestSong.rightsNotes || '—'}</dd>
          </dl>
          <label className="flex min-h-11 items-center gap-2 font-medium text-ink">
            <input type="checkbox" checked={reviewedLatest} onChange={(event) => setReviewedLatest(event.target.checked)} />
            {t('song.reviewLatestVersion')}
          </label>
        </div>
      ) : null}
      <ProblemAlert message={save.error != null ? mutationErrorMessage(save.error, t) : null} />
      <Field label={t('songs.titleLabel')}>
        <input
          className={fieldClass}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label={t('song.originLabel')}>
        <select
          className={fieldClass}
          required
          value={originKind}
          onChange={(e) => setOriginKind(e.target.value as SongOriginKind)}
        >
          <option value="original">{t('song.originOriginal')}</option>
          <option value="cover">{t('song.originCover')}</option>
          <option value="other">{t('song.originOther')}</option>
        </select>
      </Field>
      <Field label={t('songs.attributionLabel')} hint={t('song.clearAttributionHint')}>
        <input
          className={fieldClass}
          value={attribution}
          onChange={(e) => setAttribution(e.target.value)}
          maxLength={500}
        />
      </Field>
      <Field label={t('songCreate.wizardGenre')}>
        <input className={fieldClass} value={genre} onChange={(e) => setGenre(e.target.value)} maxLength={100} />
      </Field>
      <Field label={t('songs.rightsLabel')} hint={t('song.clearRightsHint')}>
        <textarea
          className={fieldClass}
          rows={3}
          value={rightsNotes}
          onChange={(e) => setRightsNotes(e.target.value)}
          maxLength={2000}
        />
      </Field>
      <Field label={t('songCreate.tagsLabel')} hint={t('songCreate.tagsPlaceholder')}>
        <input className={fieldClass} value={tags} onChange={(event) => setTags(event.target.value)} maxLength={200} />
      </Field>
      <FormActions>
        <Button type="submit" disabled={save.pending || Boolean(latestSong && !reviewedLatest)}>
          {save.pending ? t('song.saving') : t('song.save')}
        </Button>
        <Button variant="secondary" disabled={save.pending} onClick={onCancel}>
          {t('song.cancel')}
        </Button>
      </FormActions>
    </form>
  )
}

function ArrangementCreateForm({
  groupId,
  songId,
  onCreated,
  onCancel,
}: {
  groupId: string
  songId: string
  onCreated: (arrangementId: string) => Promise<void>
  onCancel: () => void
}) {
  const [label, setLabel] = useState('')
  const [defaultKey, setDefaultKey] = useState('')
  const [defaultBpm, setDefaultBpm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [showMusicalDetails, setShowMusicalDetails] = useState(false)
  const { t } = useT()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    let bpm: number | null = null
    if (defaultBpm.trim()) {
      const parsed = Number(defaultBpm)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 400) {
        setError(t('arrangement.tempoInvalid'))
        setPending(false)
        return
      }
      bpm = parsed
    }

    try {
      const created = await createArrangement(groupId, songId, {
        label: label.trim(),
        defaultKey: defaultKey.trim() || null,
        defaultBpm: bpm,
      })
      await onCreated(created.id)
    } catch (err) {
      setError(mutationErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <GroupDialog
      open
      onClose={onCancel}
      title={t('song.createArrangement')}
      description={t('song.createArrangementHint')}
      pending={pending}
      confirmDiscard
      testId="arrangement-create-dialog"
      size="sm"
      onSubmit={onSubmit}
      footer={
        <>
          <GroupButton variant="secondary" onClick={onCancel} disabled={pending}>
            {t('song.cancel')}
          </GroupButton>
          <GroupButton type="submit" disabled={pending || !label.trim()}>
            {pending ? t('song.creating') : t('song.createArrangement')}
          </GroupButton>
        </>
      }
    >
      {error ? <p role="alert" className="text-sm text-error-ink">{error}</p> : null}
      <div className="space-y-4">
        <GroupInput
          label={t('song.labelLabel')}
          hint={t('song.versionNameHint')}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          required
          maxLength={200}
          data-autofocus
        />
        <button
          type="button"
          aria-expanded={showMusicalDetails}
          onClick={() => setShowMusicalDetails((current) => !current)}
          className="min-h-11 rounded-lg text-sm font-medium text-primary-ink underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t(showMusicalDetails ? 'song.hideVersionDetails' : 'song.showVersionDetails')}
        </button>
        {showMusicalDetails ? (
          <div className="space-y-4 rounded-xl bg-surface-hover p-4">
            <p className="text-sm text-muted">{t('song.versionDetailsHint')}</p>
            <GroupInput
              label={t('song.keyLabel')}
              value={defaultKey}
              onChange={(event) => setDefaultKey(event.target.value)}
              maxLength={32}
            />
            <GroupInput
              label={t('song.bpmLabel')}
              type="number"
              min={1}
              max={400}
              inputMode="numeric"
              value={defaultBpm}
              onChange={(event) => setDefaultBpm(event.target.value)}
            />
          </div>
        ) : null}
      </div>
    </GroupDialog>
  )
}
