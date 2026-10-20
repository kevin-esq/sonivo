import { routes } from '../routing/routes'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Paperclip } from 'lucide-react'
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

import { SongContentGuide } from './SongContentGuide'
import { RehearsalBodyView } from './ChordProView'

type SongTab = 'lyrics' | 'chords' | 'notes' | 'files'

const SONG_TABS: { id: SongTab; labelKey: I18nKey }[] = [
  { id: 'lyrics', labelKey: 'song.tabLyrics' },
  { id: 'chords', labelKey: 'song.tabChords' },
  { id: 'notes', labelKey: 'song.tabNotes' },
  { id: 'files', labelKey: 'song.tabFiles' },
]

export function SongDetailPage({ user }: { user: CurrentUser }) {
  const { groupId, songId } = useParams()
  const navigate = useNavigate()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [conflict, setConflict] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [creatingArrangement, setCreatingArrangement] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tab, setTab] = useState<SongTab>('lyrics')
  const [pickedArrangementId, setPickedArrangementId] = useState<string | null>(null)
  const { t } = useT()

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
      navigate(routes.groupLibrary(groupId))
    } catch (err) {
      setConfirmDelete(false)
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
        <Link className="font-semibold text-primary-ink no-underline hover:underline" to={routes.home}>
          {t('song.myGroups')}
        </Link>
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
        <Link
          className="font-semibold text-primary-ink no-underline hover:underline"
          to={routes.groupLibrary(group.id)}
        >
          {t('song.library')}
        </Link>
      </div>
    )
  }

  const { song } = loaded
  const selectedArrangement =
    arrangements.find((item) => item.id === selectedArrangementId) ?? null
  const arrangementDetail = detail.data
  const deleteError = remove.error != null ? mutationErrorMessage(remove.error, t) : null

  const showAddArrangement = isOwner && !creatingArrangement

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

  return (
    <section className="space-y-8" aria-labelledby="song-heading">
      <header data-testid="song-hero" className="space-y-4 rounded-3xl border border-[var(--color-score-border)] bg-[var(--color-score-soft)] p-5 text-[var(--color-score-ink)] sm:p-8">
        <PageBreadcrumb
          items={[
            { to: routes.group(group.id), label: group.name },
            { to: routes.groupLibrary(group.id), label: t('songs.pageTitle') },
            { label: song.title },
          ]}
        />
        <div className="flex flex-wrap items-start gap-4">
          <OriginMark kind={song.originKind} />
          <div className="min-w-0 flex-1 space-y-2">
            <h1 id="song-heading" className="text-3xl font-bold tracking-tight text-[var(--color-score-ink)] sm:text-4xl">
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
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('song.editSong')}
            </Button>
          ) : null}
        </div>
      </header>

      <ProblemAlert message={deleteError} />
      <ConflictAlert message={conflict} />
      <SongContentGuide />

      <div className={cn('grid gap-8 lg:items-start', editing ? 'grid-cols-1' : 'lg:grid-cols-[minmax(0,1fr)_20rem]')}>
        <div className="space-y-8">
          {/* W-F: arrangement content tabs (lyrics / chords / notes / files). */}
          <section className="space-y-4" aria-label={t('song.tabsLabel')}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div
                role="tablist"
                aria-label={t('song.tabsLabel')}
                className="grid w-full grid-cols-2 gap-1 rounded-xl bg-surface-hover p-1 sm:w-auto sm:grid-cols-4"
              >
                {SONG_TABS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    id={`song-tab-${option.id}`}
                    aria-selected={tab === option.id}
                    aria-controls={`song-panel-${option.id}`}
                    data-testid={`song-tab-${option.id}`}
                    onClick={() => setTab(option.id)}
                    className={cn(
                      'min-h-11 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                      tab === option.id
                        ? 'bg-surface text-ink shadow-sm'
                        : 'text-muted hover:text-ink',
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
                      const className =
                        'flex min-h-11 items-center gap-3 rounded-xl border border-border-subtle px-3 py-2 no-underline hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
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
              <Link
              className="inline-flex min-h-11 items-center rounded-xl bg-primary-strong px-5 text-sm font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary-strong/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                to={routes.groupArrangement(group.id, selectedArrangement.id)}
              >
                {t('song.editArrangementContent')}
              </Link>
            ) : null}
          </section>

          <section className="space-y-4" aria-labelledby="arrangements-heading">
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

            {arrangements.length === 0 && !creatingArrangement ? (
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
                    <Link
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
                    </Link>
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

        {editing || song.rightsNotes?.trim() || resources.length > 0 ? <aside
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
          className="space-y-3 rounded-2xl border border-error/40 bg-error/5 p-5"
        >
          <h2 id="song-danger-heading" className="text-lg font-semibold text-error-ink">
            {t('common.dangerZone')}
          </h2>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
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
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove.run()}
      >
        <p>
          {t('song.deleteBody')}
        </p>
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
    <form className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5" onSubmit={onSubmit} noValidate>
      <div className="space-y-1">
        <h3 className="font-semibold">{t('song.createArrangement')}</h3>
        <p className="text-sm leading-6 text-muted">{t('song.createArrangementHint')}</p>
      </div>
      <ProblemAlert message={error} />
      <Field label={t('song.labelLabel')}>
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label={t('song.keyLabel')}>
        <input
          className={fieldClass}
          value={defaultKey}
          onChange={(e) => setDefaultKey(e.target.value)}
          maxLength={32}
        />
      </Field>
      <Field label={t('song.bpmLabel')}>
        <input
          className={fieldClass}
          type="number"
          min={1}
          max={400}
          inputMode="numeric"
          value={defaultBpm}
          onChange={(e) => setDefaultBpm(e.target.value)}
        />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? t('song.creating') : t('song.createArrangement')}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          {t('song.cancel')}
        </Button>
      </FormActions>
    </form>
  )
}
