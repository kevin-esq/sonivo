import { routes } from '../routing/routes'
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronRight, Paperclip, Pause, Play } from 'lucide-react'
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
import { GroupButton, GroupDialog, GroupInput } from '../groups/ui'
import {
  EmptyPanel,
  Field,
  FormActions,
  NumberedMark,
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
  const { navigate } = useGroupShell()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [conflict, setConflict] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [creatingArrangement, setCreatingArrangement] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [tab, setTab] = useState<SongTab>('lyrics')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [pickedArrangementId, setPickedArrangementId] = useState<string | null>(null)
  const { t } = useT()
  const audioPlayer = useAudioPlayer()

  const isOwner = canManageContentRole(group?.role)

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
  const selectedArrangementId =
    arrangements.find((item) => item.id === pickedArrangementId)?.id ??
    arrangements[0]?.id ??
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
          t('schedule.setlistArrangementsOne'),
          t('schedule.setlistArrangementsMany'),
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
  const showSongFacts = editing || Boolean(song.rightsNotes?.trim()) || resources.length > 0

  return (
    <section className="space-y-8" aria-labelledby="song-heading">
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
              {song.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[var(--color-score-paper-soft)] px-3 py-1 text-xs font-medium text-[var(--color-score-ink-soft)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          {isOwner && !editing ? (
            <Button className="col-span-2 justify-self-end sm:col-span-1" variant="secondary" onClick={() => setEditing(true)}>
              {t('song.editSong')}
            </Button>
          ) : null}
        </div>
      </header>

      <ProblemAlert message={deleteError} />
      <ConflictAlert message={conflict} />
      <SongContentGuide />

      <div className={cn('grid gap-8 lg:items-start', showSongFacts ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : 'grid-cols-1')}>
        <div className={cn('grid gap-4 lg:items-start', editing ? 'grid-cols-1' : 'lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,1fr)]')}>
          {/* W-F: arrangement content tabs (lyrics / chords / notes / files). */}
          <section className="order-last space-y-4 lg:order-none" aria-label={t('song.tabsLabel')}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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

              {arrangements.length > 1 ? (
                <label className="flex items-center gap-2 text-sm text-muted">
                  <span>{t('song.arrangementPicker')}</span>
                  <select
                    className={cn(fieldClass, 'min-w-40')}
                    value={selectedArrangementId ?? ''}
                    onChange={(event) => setPickedArrangementId(event.target.value)}
                  >
                    {arrangements.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div
              role="tabpanel"
              id={`song-panel-${tab}`}
              aria-labelledby={`song-tab-${tab}`}
              data-testid="song-tabpanel"
              className="min-h-64 rounded-2xl border border-border-subtle bg-surface p-5 sm:p-7"
            >
              {!selectedArrangement ? (
                <p className="text-sm text-muted">{t('song.noArrangementForTabs')}</p>
              ) : detail.loading ? (
                <p aria-live="polite" className="text-sm text-muted">
                  {t('song.loadingArrangements')}
                </p>
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
            {isOwner && selectedArrangement ? (
              <AppLink
              className="inline-flex min-h-11 items-center rounded-xl bg-primary-strong px-5 text-sm font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary-strong/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                to={routes.groupArrangement(group.id, selectedArrangement.id)}
              >
                {t('song.editArrangementContent')}
              </AppLink>
            ) : null}
          </section>

          <section className="order-first space-y-4 lg:order-none" aria-labelledby="arrangements-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="arrangements-heading" className="text-lg font-semibold">
                {t('song.arrangementsTitle')}
              </h2>
              {showAddArrangement && arrangements.length > 0 ? (
                <Button onClick={() => setCreatingArrangement(true)}>{t('song.addArrangement')}</Button>
              ) : null}
            </div>
            <p className="text-sm text-muted">
              {t('song.arrangementsHint')}
            </p>

            {arrangements.length === 0 ? (
              <EmptyPanel
                title={t('song.noArrangementsTitle')}
                description={t('song.noArrangementsBody')}
                action={
                  showAddArrangement ? (
                    <Button onClick={() => setCreatingArrangement(true)}>{t('song.addArrangement')}</Button>
                  ) : null
                }
              />
            ) : (
              <ol className="space-y-2">
                {arrangements.map((arrangement, index) => (
                  <li
                    key={arrangement.id}
                    className="library-enter"
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                  >
                    <AppLink
                      className="flex min-h-[44px] items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-3 py-3 no-underline transition duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] motion-reduce:transition-none"
                      to={routes.groupArrangement(group.id, arrangement.id)}
                    >
                      <NumberedMark n={index + 1} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{arrangement.label}</span>
                        <span className="block truncate text-sm text-muted">
                          {arrangement.defaultKey ? arrangement.defaultKey : ''}
                          {arrangement.defaultBpm != null
                            ? `${arrangement.defaultKey ? ' · ' : ''}${arrangement.defaultBpm} BPM`
                            : !arrangement.defaultKey
                              ? t('song.noKeyTempo')
                              : ''}
                        </span>
                      </span>
                      <ReadinessChip
                        testId="arrangement-readiness"
                        tone={arrangement.defaultKey || arrangement.defaultBpm != null ? 'accent' : 'neutral'}
                      >
                        {arrangement.defaultKey
                          ? `${arrangement.defaultKey}${arrangement.defaultBpm != null ? ` · ${arrangement.defaultBpm}` : ''}`
                          : t('setlists.noKey')}
                      </ReadinessChip>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                    </AppLink>
                  </li>
                ))}
              </ol>
            )}

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
        </div>

        {showSongFacts ? <aside
          data-testid="song-facts"
          className="space-y-4 rounded-2xl border border-border-subtle bg-surface-hover p-5"
        >
          {!editing ? (
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {t('song.infoTitle')}
            </h3>
          ) : null}
          {editing && isOwner ? (
            <SongEditForm
              song={song}
              groupId={group.id}
              onCancel={() => setEditing(false)}
              onSaved={async () => {
                setEditing(false)
                setConflict(null)
                surface.reload()
              }}
              onConflict={async () => {
                setConflict(t('common.errorConflict'))
                setEditing(false)
                surface.reload()
              }}
            />
          ) : (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted">{t('song.rightsLabel')}</dt>
                <dd className="whitespace-pre-wrap font-medium">{song.rightsNotes ?? '—'}</dd>
              </div>
            </dl>
          )}

          {!editing ? <div className="space-y-2 border-t border-border-subtle pt-3">
            <h4 className="text-sm font-semibold text-muted">
              {t('song.relatedFiles')}
            </h4>
            {resources.length === 0 ? (
              <p className="text-sm text-muted">{t('song.noRelatedFiles')}</p>
            ) : (
              <ul className="space-y-2">
                {resources.slice(0, 6).map((resource) => {
                  const href = resource.kind === 'link'
                    ? safeExternalResourceUrl(resource.url)
                    : resourceContentUrl(group.id, selectedArrangementId!, resource.id)
                  const content = (
                    <>
                      <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{resource.label}</span>
                    </>
                  )
                  const className =
                    'flex items-center gap-2 text-sm font-medium text-primary-ink no-underline hover:underline'
                  return (
                    <li key={resource.id}>
                      {href ? (
                        <a className={className} href={href} target="_blank" rel="noopener noreferrer">
                          {content}
                        </a>
                      ) : (
                        <div className={className} aria-disabled="true">{content}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div> : null}

        </aside> : null}
      </div>

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

function SongEditForm({
  song,
  groupId,
  onCancel,
  onSaved,
  onConflict,
}: {
  song: SongDetail
  groupId: string
  onCancel: () => void
  onSaved: (song: SongDetail) => Promise<void>
  onConflict: () => Promise<void>
}) {
  const [title, setTitle] = useState(song.title)
  const [originKind, setOriginKind] = useState<SongOriginKind>(song.originKind as SongOriginKind)
  const [attribution, setAttribution] = useState(song.attribution ?? '')
  const [rightsNotes, setRightsNotes] = useState(song.rightsNotes ?? '')
  const { t } = useT()

  const save = useAction(async () => {
    try {
      const updated = await updateSong(groupId, song.id, {
        expectedVersion: song.version,
        title: title.trim(),
        originKind,
        attribution,
        rightsNotes,
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
      <Field label={t('songs.rightsLabel')} hint={t('song.clearRightsHint')}>
        <textarea
          className={fieldClass}
          rows={3}
          value={rightsNotes}
          onChange={(e) => setRightsNotes(e.target.value)}
          maxLength={2000}
        />
      </Field>
      <FormActions>
        <Button type="submit" disabled={save.pending}>
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
      <GroupInput
        label={t('song.labelLabel')}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        required
        maxLength={200}
        data-autofocus
      />
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
    </GroupDialog>
  )
}
