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
  CONFLICT_MESSAGE,
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

type SongTab = 'lyrics' | 'chords' | 'notes' | 'files'

const SONG_TABS: { id: SongTab; labelKey: I18nKey }[] = [
  { id: 'lyrics', labelKey: 'cancion.tabLyrics' },
  { id: 'chords', labelKey: 'cancion.tabChords' },
  { id: 'notes', labelKey: 'cancion.tabNotes' },
  { id: 'files', labelKey: 'cancion.tabFiles' },
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
      navigate(`/groups/${groupId}/library`)
    } catch (err) {
      setConfirmDelete(false)
      if (isConflictError(err)) {
        setConflict(CONFLICT_MESSAGE)
        surface.reload()
        return
      }
      throw err
    }
  })

  if (group === undefined) {
    return <p aria-live="polite">{t('cancion.loading')}</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="font-semibold text-primary-ink no-underline hover:underline" to="/">
          {t('cancion.myGroups')}
        </Link>
      </div>
    )
  }

  const loaded = surface.data
  if (loaded === undefined) {
    if (surface.error == null) {
      return <p aria-live="polite">{t('cancion.loading')}</p>
    }
    return (
      <div className="space-y-3">
        <ProblemAlert message={mutationErrorMessage(surface.error)} />
        <Link
          className="font-semibold text-primary-ink no-underline hover:underline"
          to={`/groups/${group.id}/library`}
        >
          {t('cancion.library')}
        </Link>
      </div>
    )
  }

  const { song } = loaded
  const selectedArrangement =
    arrangements.find((item) => item.id === selectedArrangementId) ?? null
  const arrangementDetail = detail.data
  const deleteError = remove.error != null ? mutationErrorMessage(remove.error) : null

  const showAddArrangement = isOwner && !creatingArrangement

  const arrangementCountLabel =
    song.arrangementCount === 0
      ? t('listas.noArrangements')
      : plural(
          song.arrangementCount,
          t('agenda.setlistArrangementsOne'),
          t('agenda.setlistArrangementsMany'),
        )

  const tabContent: Record<SongTab, string | null> = {
    lyrics: arrangementDetail?.lyrics ?? null,
    chords: arrangementDetail?.chords ?? null,
    notes: arrangementDetail?.notes ?? null,
    files: null,
  }

  const emptyKey: Record<SongTab, I18nKey> = {
    lyrics: 'cancion.noLyrics',
    chords: 'cancion.noChords',
    notes: 'cancion.noNotes',
    files: 'cancion.noRelatedFiles',
  }

  const resources: ResourceSummary[] = arrangementDetail?.resources ?? []

  return (
    <section className="space-y-6" aria-labelledby="song-heading">
      <header data-testid="song-hero" className="space-y-3">
        <PageBreadcrumb
          items={[
            { to: `/groups/${group.id}`, label: group.name },
            { to: `/groups/${group.id}/library`, label: t('canciones.pageTitle') },
            { label: song.title },
          ]}
        />
        <div className="flex flex-wrap items-start gap-3">
          <OriginMark kind={song.originKind} />
          <div className="min-w-0 flex-1 space-y-2">
            <h1 id="song-heading" className="text-3xl font-bold tracking-tight text-ink">
              {song.title}
            </h1>
            {song.attribution || !isOwner ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                {song.attribution ? <span>{song.attribution}</span> : null}
                {!isOwner ? <span>{t('cancion.readonly')}</span> : null}
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
                  className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary-ink"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <ProblemAlert message={deleteError} />
      <ConflictAlert message={conflict} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-8">
          {/* W-F: arrangement content tabs (lyrics / chords / notes / files). */}
          <section className="space-y-4" aria-label={t('cancion.tabsLabel')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label={t('cancion.tabsLabel')}
                className="flex flex-wrap gap-1 rounded-xl border border-border-subtle bg-surface p-0.5"
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
                      'min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                      tab === option.id
                        ? 'bg-primary-strong text-primary-foreground'
                        : 'text-muted hover:text-ink',
                    )}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>

              {arrangements.length > 1 ? (
                <label className="flex items-center gap-2 text-sm text-muted">
                  <span>{t('cancion.arrangementPicker')}</span>
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
              className="min-h-40 rounded-2xl border border-border-subtle bg-surface p-5"
            >
              {!selectedArrangement ? (
                <p className="text-sm text-muted">{t('cancion.noArrangementForTabs')}</p>
              ) : detail.loading ? (
                <p aria-live="polite" className="text-sm text-muted">
                  {t('cancion.loadingArrangements')}
                </p>
              ) : tab === 'files' ? (
                resources.length === 0 ? (
                  <p className="text-sm text-muted">{t('cancion.noRelatedFiles')}</p>
                ) : (
                  <ul className="space-y-2">
                    {resources.map((resource) => (
                      <li key={resource.id}>
                        <a
                          className="flex min-h-11 items-center gap-3 rounded-xl border border-border-subtle px-3 py-2 no-underline hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          href={
                            resource.kind === 'link'
                              ? resource.url ?? '#'
                              : resourceContentUrl(group.id, selectedArrangement.id, resource.id)
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Paperclip className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink">
                              {resource.label}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {resource.originalFileName ?? resource.url ?? resource.kind}
                            </span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )
              ) : tabContent[tab]?.trim() ? (
                <pre className="max-w-full overflow-x-auto whitespace-pre-wrap font-sans text-sm text-ink">
                  {tabContent[tab]}
                </pre>
              ) : (
                <p className="text-sm text-muted">{t(emptyKey[tab])}</p>
              )}
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="arrangements-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="arrangements-heading" className="text-lg font-semibold">
                {t('cancion.arrangementsTitle')}
              </h2>
              {showAddArrangement && arrangements.length > 0 ? (
                <Button onClick={() => setCreatingArrangement(true)}>{t('cancion.addArrangement')}</Button>
              ) : null}
            </div>
            <p className="text-sm text-muted">
              {t('cancion.arrangementsHint')}
            </p>

            {arrangements.length === 0 && !creatingArrangement ? (
              <EmptyPanel
                title={t('cancion.noArrangementsTitle')}
                description={t('cancion.noArrangementsBody')}
                action={
                  showAddArrangement ? (
                    <Button onClick={() => setCreatingArrangement(true)}>{t('cancion.addArrangement')}</Button>
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
                      className="flex min-h-[44px] items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-3 py-3 no-underline shadow-sm transition duration-150 hover:border-border-subtle hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] motion-reduce:transition-none"
                      to={`/groups/${group.id}/arrangements/${arrangement.id}`}
                    >
                      <NumberedMark n={index + 1} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{arrangement.label}</span>
                        <span className="block truncate text-sm text-muted">
                          {arrangement.defaultKey ? arrangement.defaultKey : ''}
                          {arrangement.defaultBpm != null
                            ? `${arrangement.defaultKey ? ' · ' : ''}${arrangement.defaultBpm} BPM`
                            : !arrangement.defaultKey
                              ? t('cancion.noKeyTempo')
                              : ''}
                        </span>
                      </span>
                      <ReadinessChip
                        testId="arrangement-readiness"
                        tone={arrangement.defaultKey || arrangement.defaultBpm != null ? 'accent' : 'neutral'}
                      >
                        {arrangement.defaultKey
                          ? `${arrangement.defaultKey}${arrangement.defaultBpm != null ? ` · ${arrangement.defaultBpm}` : ''}`
                          : t('listas.noKey')}
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
                  navigate(`/groups/${group.id}/arrangements/${createdId}`)
                }}
              />
            ) : null}
          </section>
        </div>

        <aside
          data-testid="song-facts"
          className="space-y-4 rounded-2xl border border-border-subtle bg-surface-hover p-5 shadow-sm"
        >
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {t('cancion.infoTitle')}
          </h3>
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
                setConflict(CONFLICT_MESSAGE)
                setEditing(false)
                surface.reload()
              }}
            />
          ) : (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted">{t('cancion.infoTitleLabel')}</dt>
                <dd className="font-medium">{song.title}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('cancion.infoArtist')}</dt>
                <dd className="font-medium">{song.attribution ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('cancion.infoKey')}</dt>
                <dd className="font-medium">{selectedArrangement?.defaultKey ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('cancion.infoTempo')}</dt>
                <dd className="font-medium">
                  {selectedArrangement?.defaultBpm != null
                    ? `${selectedArrangement.defaultBpm} BPM`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t('cancion.infoTags')}</dt>
                <dd className="font-medium">{song.tags.length > 0 ? song.tags.join(', ') : '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('cancion.originLabel')}</dt>
                <dd className="font-medium">{formatOriginKind(song.originKind)}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('cancion.rightsLabel')}</dt>
                <dd className="whitespace-pre-wrap font-medium">{song.rightsNotes ?? '—'}</dd>
              </div>
            </dl>
          )}

          {isOwner && !editing ? (
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {t('cancion.editSong')}
              </Button>
            </div>
          ) : null}

          <div className="space-y-2 border-t border-border-subtle pt-3">
            <h4 className="text-sm font-semibold text-muted">
              {t('cancion.relatedFiles')}
            </h4>
            {resources.length === 0 ? (
              <p className="text-sm text-muted">{t('cancion.noRelatedFiles')}</p>
            ) : (
              <ul className="space-y-2">
                {resources.slice(0, 6).map((resource) => (
                  <li key={resource.id}>
                    <a
                      className="flex items-center gap-2 text-sm font-medium text-primary-ink no-underline hover:underline"
                      href={
                        resource.kind === 'link'
                          ? resource.url ?? '#'
                          : resourceContentUrl(group.id, selectedArrangementId!, resource.id)
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{resource.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
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
            {t('cancion.deleteSong')}
          </Button>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        title={t('cancion.deleteTitle')}
        confirmLabel={t('cancion.deleteSong')}
        cancelLabel={t('cancion.cancel')}
        pendingLabel={t('cancion.deleting')}
        pending={remove.pending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove.run()}
      >
        <p>
          {t('cancion.deleteBody')}
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
      <h3 className="font-semibold">{t('cancion.editSong')}</h3>
      <ProblemAlert message={save.error != null ? mutationErrorMessage(save.error) : null} />
      <Field label={t('canciones.titleLabel')}>
        <input
          className={fieldClass}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label={t('cancion.originLabel')}>
        <select
          className={fieldClass}
          required
          value={originKind}
          onChange={(e) => setOriginKind(e.target.value as SongOriginKind)}
        >
          <option value="original">{t('cancion.originOriginal')}</option>
          <option value="cover">{t('cancion.originCover')}</option>
          <option value="other">{t('cancion.originOther')}</option>
        </select>
      </Field>
      <Field label={t('canciones.attributionLabel')} hint={t('cancion.clearAttributionHint')}>
        <input
          className={fieldClass}
          value={attribution}
          onChange={(e) => setAttribution(e.target.value)}
          maxLength={500}
        />
      </Field>
      <Field label={t('canciones.rightsLabel')} hint={t('cancion.clearRightsHint')}>
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
          {save.pending ? t('cancion.saving') : t('cancion.save')}
        </Button>
        <Button variant="secondary" disabled={save.pending} onClick={onCancel}>
          {t('cancion.cancel')}
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
  const [lyrics, setLyrics] = useState('')
  const [chords, setChords] = useState('')
  const [structure, setStructure] = useState('')
  const [notes, setNotes] = useState('')
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
        setError('El tempo (BPM) debe ser un entero entre 1 y 400.')
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
        lyrics: lyrics.trim() || null,
        chords: chords.trim() || null,
        structure: structure.trim() || null,
        notes: notes.trim() || null,
      })
      await onCreated(created.id)
    } catch (err) {
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-4 border-t border-border-subtle pt-4" onSubmit={onSubmit} noValidate>
      <h3 className="font-semibold">{t('cancion.createArrangement')}</h3>
      <ProblemAlert message={error} />
      <Field label={t('cancion.labelLabel')}>
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label={t('cancion.keyLabel')}>
        <input
          className={fieldClass}
          value={defaultKey}
          onChange={(e) => setDefaultKey(e.target.value)}
          maxLength={32}
        />
      </Field>
      <Field label={t('cancion.bpmLabel')}>
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
      <Field label={t('cancion.lyricsLabel')}>
        <textarea className={fieldClass} rows={3} value={lyrics} onChange={(e) => setLyrics(e.target.value)} />
      </Field>
      <Field label={t('cancion.chordsLabel')}>
        <textarea className={fieldClass} rows={3} value={chords} onChange={(e) => setChords(e.target.value)} data-testid="arrangement-chords" />
      </Field>
      <Field label={t('cancion.structureLabel')}>
        <textarea
          className={fieldClass}
          rows={2}
          value={structure}
          onChange={(e) => setStructure(e.target.value)}
        />
      </Field>
      <Field label={t('cancion.notesLabel')}>
        <textarea className={fieldClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? t('cancion.creating') : t('cancion.createArrangement')}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          {t('cancion.cancel')}
        </Button>
      </FormActions>
    </form>
  )
}
