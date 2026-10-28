import { routes } from '../routing/routes'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createFileResource,
  createLinkResource,
  deleteArrangement,
  deleteResource,
  getArrangement,
  getSong,
  isConflictError,
  resourceContentUrl,
  updateArrangement,
  updateLinkResource,
  type ArrangementDetail,
  type CurrentUser,
  type ResourcePurpose,
  type ResourceSummary,
} from '../api/client'
import { Button, buttonVariants } from '../ui/button'
import { fieldClass } from '../ui/field'
import { FileDropzone } from '../ui/FileDropzone'
import {
  EmptyPanel,
  Field,
  FormActions,
  PageBreadcrumb,
  PurposeHeading,
  RESOURCE_PURPOSE_ORDER,
  ReadinessChip,
  groupResourcesByPurpose,
} from './chrome'
import { ChordProView } from './ChordProView'
import { VisualChordEditor, type ArrangementEditorMode } from './VisualChordEditor'
import { LrcPanel } from './LrcPanel'
import { LyricsExportPanel } from './LyricsExportPanel'
import { AudioDigitizer } from './AudioDigitizer'
import { safeExternalResourceUrl } from './resourceUrl'
import { looksLikeChordPro } from './chordPro'
import {
  parseChordTimingTimeline,
  serializeChordTimingTimeline,
  splitChordProLines,
  type ChordTimingTimeline,
} from './chordTiming'
import { listPracticeAudioTracks } from './pickPracticeAudio'
import { importChordSheetText } from './chordSheetImport'
import { composeChordPro, varyProgression, rewriteVerse } from './composeChordPro'
import { fileUploadErrorMessage, isAudioUpload, resourceUploadLimit, validateFileForUpload } from './fileUploadErrors'
import {
  ConfirmDialog,
  ConflictAlert,
  formatPurpose,
  canManageContentRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from './ui'
import { useT } from '../i18n'
import { plural } from '../ui/plural'
import { AppLink } from '../routing/AppLink'
import { useGroupShell } from '../shell/GroupShellContext'
import { Pause, Play } from 'lucide-react'
import { useAudioPlayer } from './AudioPlayerContext'
import { isPlayableAudioResource } from './pickPracticeAudio'
import { GroupDialog } from '../groups/ui'

export function ArrangementDetailPage({ user, groupId, arrangementId }: { user: CurrentUser; groupId: string; arrangementId: string }) {
  const { navigate } = useGroupShell()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [arrangement, setArrangement] = useState<ArrangementDetail | null | undefined>(undefined)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadingArrangement, setLoadingArrangement] = useState(true)
  const [songTitle, setSongTitle] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [latestArrangement, setLatestArrangement] = useState<ArrangementDetail | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmCancelEdit, setConfirmCancelEdit] = useState(false)
  const [creatingResource, setCreatingResource] = useState(false)
  const [creatingFileResource, setCreatingFileResource] = useState(false)
  const [resourceDraftDirty, setResourceDraftDirty] = useState(false)
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null)
  const [confirmDeleteArrangement, setConfirmDeleteArrangement] = useState(false)
  const [deletingArrangement, setDeletingArrangement] = useState(false)
  const [resourceToDelete, setResourceToDelete] = useState<ResourceSummary | null>(null)
  const [deletingResource, setDeletingResource] = useState(false)
  const { t } = useT()

  const isOwner = canManageContentRole(group?.role)

  function cancelArrangementEdit() {
    setConfirmCancelEdit(false)
    setLatestArrangement(null)
    setEditing(false)
  }

  async function reloadArrangement() {
    if (!groupId || !arrangementId) return
    const keepCurrentView = arrangement != null
    setLoadFailed(false)
    setError(null)
    if (!keepCurrentView) {
      setLoadingArrangement(true)
      setArrangement(undefined)
    }
    try {
      const result = await getArrangement(groupId, arrangementId)
      setArrangement(result)
      try {
        const song = await getSong(groupId, result.songId)
        setSongTitle(song.title)
      } catch {
        setSongTitle(null)
      }
    } catch (err) {
      setArrangement(null)
      setError(mutationErrorMessage(err, t))
      setLoadFailed(true)
      throw err
    } finally {
      setLoadingArrangement(false)
    }
  }

  useEffect(() => {
    if (!groupId || !arrangementId || !group) return
    let cancelled = false
    async function load() {
      setArrangement(undefined)
      setLoadFailed(false)
      setLoadingArrangement(true)
      setSongTitle(null)
      setError(null)
      setConflict(null)
      try {
        const result = await getArrangement(groupId!, arrangementId!)
        if (cancelled) return
        setArrangement(result)
        setLoadingArrangement(false)
        try {
          const song = await getSong(groupId!, result.songId)
          if (!cancelled) setSongTitle(song.title)
        } catch {
          if (!cancelled) setSongTitle(null)
        }
      } catch (err) {
        if (cancelled) return
        setArrangement(null)
        setLoadingArrangement(false)
        setLoadFailed(true)
        setError(mutationErrorMessage(err, t))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, arrangementId, group])

  async function handleDeleteArrangement() {
    if (!groupId || !arrangementId || !arrangement) return
    setDeletingArrangement(true)
    setError(null)
    setConflict(null)
    try {
      await deleteArrangement(groupId, arrangementId, arrangement.version)
      setConfirmDeleteArrangement(false)
      navigate(routes.groupSong(groupId, arrangement.songId))
    } catch (err) {
      if (isConflictError(err)) {
        setConflict(t('common.errorConflict'))
        setConfirmDeleteArrangement(false)
        try {
          await reloadArrangement()
        } catch (reloadErr) {
          setError(mutationErrorMessage(reloadErr, t))
        }
      } else {
        setError(mutationErrorMessage(err, t))
        setConfirmDeleteArrangement(false)
      }
    } finally {
      setDeletingArrangement(false)
    }
  }

  async function handleDeleteResource() {
    if (!groupId || !arrangementId || !resourceToDelete) return
    setDeletingResource(true)
    setError(null)
    try {
      await deleteResource(groupId, arrangementId, resourceToDelete.id)
      setResourceToDelete(null)
      await reloadArrangement()
    } catch (err) {
      setError(mutationErrorMessage(err, t))
      setResourceToDelete(null)
    } finally {
      setDeletingResource(false)
    }
  }

  if (group === undefined) {
    return <p aria-live="polite">{t('arrangement.loading')}</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <AppLink className="font-semibold text-primary-ink no-underline hover:underline" to={routes.home}>
          {t('arrangement.myGroups')}
        </AppLink>
      </div>
    )
  }

  if (arrangement === undefined) {
    return loadingArrangement ? <p aria-live="polite">{t('arrangement.loading')}</p> : (
      <div className="space-y-3" role="alert">
        <ProblemAlert message={error ?? t('arrangement.loadError')} />
        <Button type="button" variant="secondary" onClick={() => void reloadArrangement()}>{t('state.retry')}</Button>
        <AppLink className="block font-semibold text-primary-ink no-underline hover:underline" to={routes.groupLibrary(group.id)}>{t('arrangement.library')}</AppLink>
      </div>
    )
  }

  if (arrangement === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? t('arrangement.notFound')} />
        {loadFailed ? <Button type="button" variant="secondary" onClick={() => void reloadArrangement()}>{t('state.retry')}</Button> : null}
        <AppLink
          className="font-semibold text-primary-ink no-underline hover:underline"
          to={routes.groupLibrary(group.id)}
        >
          {t('arrangement.library')}
        </AppLink>
      </div>
    )
  }

  const grouped = groupResourcesByPurpose(arrangement.resources)
  const showAddResource = isOwner
  const songHref = routes.groupSong(group.id, arrangement.songId)
  const hasChart = arrangement.resources.some((resource) => resource.purpose === 'chart')
  const resourceCountLabel =
    arrangement.resources.length === 0
      ? t('arrangement.noMaterialsCount')
      : plural(arrangement.resources.length, t('arrangement.materialOne'), t('arrangement.materialMany'))
  const hasRehearsalDetails = Boolean(
    arrangement.defaultKey ||
    arrangement.defaultBpm != null ||
    arrangement.lyrics?.trim() ||
    arrangement.chords?.trim() ||
    arrangement.structure?.trim() ||
    arrangement.notes?.trim(),
  )
  const showRehearsalSummary = !editing && hasRehearsalDetails
  const hasLyrics = Boolean(arrangement.lyrics?.trim())
  const chordText = arrangement.chords?.trim()
  const hasDistinctChords = Boolean(
    chordText && chordText !== arrangement.lyrics?.trim(),
  )

  return (
    <section className="space-y-8" aria-labelledby="arrangement-heading">
      <header data-testid="arrangement-hero" className="sonivo-score-header space-y-4">
        <PageBreadcrumb
          items={[
            { to: routes.group(group.id), label: group.name },
            { to: routes.groupLibrary(group.id), label: t('songs.pageTitle') },
            { to: songHref, label: songTitle ?? t('arrangement.songFallback') },
            { label: arrangement.label },
          ]}
        />
        <div className="space-y-2">
          <h1 id="arrangement-heading" className="sonivo-page-title max-w-full break-words text-[var(--color-score-ink)] [overflow-wrap:anywhere]">
            {arrangement.label}
          </h1>
          <p className="text-sm text-[var(--color-score-muted)]">
            {t('arrangement.ofPrefix')}
            {songTitle ? (
              <AppLink className="font-medium text-primary-ink no-underline hover:underline" to={songHref}>
                {songTitle}
              </AppLink>
            ) : (
              t('arrangement.thisSong')
            )}
            {!isOwner ? ` · ${t('arrangement.readonly')}` : ''}
          </p>
          {!editing ? <>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <ReadinessChip
              testId="arrangement-resource-count"
              tone={arrangement.resources.length === 0 ? 'neutral' : 'ok'}
            >
              {resourceCountLabel}
            </ReadinessChip>
            {hasChart ? <ReadinessChip testId="arrangement-chart-chip" tone="accent">{t('setlists.hasChart')}</ReadinessChip> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <AppLink
              className={buttonVariants({ variant: 'primary' })}
              to={routes.groupPractice(group.id, arrangement.id)}
            >
              {t('arrangement.practice')}
            </AppLink>
            {isOwner && !editing ? (
              <Button variant="secondary" onClick={() => { setLatestArrangement(null); setEditing(true) }}>
                {t('arrangement.editMusic')}
              </Button>
            ) : null}
          </div>
          </> : null}
        </div>
      </header>

      <ProblemAlert message={error} />
      <ConflictAlert message={conflict} />

      {editing && isOwner ? (
        <section
          className="space-y-4 rounded-2xl border border-primary/30 bg-surface p-4 sm:p-6"
          aria-labelledby="arrangement-editor-heading"
          data-testid="arrangement-editor"
        >
          <div className="space-y-1">
            <h2 id="arrangement-editor-heading" className="text-xl font-semibold tracking-tight text-ink">
              {t('arrangement.editMusic')}
            </h2>
            <p className="max-w-3xl text-sm text-muted">{t('arrangement.editMusicHint')}</p>
          </div>
          <ArrangementEditForm
            arrangement={arrangement}
            groupId={group.id}
            songTitle={songTitle ?? ''}
            onCancelAttempt={(dirty) => {
              if (dirty) setConfirmCancelEdit(true)
              else cancelArrangementEdit()
            }}
            onSaved={async (next) => {
              setArrangement(next)
              setEditing(false)
              setConflict(null)
              setLatestArrangement(null)
            }}
            onConflict={async () => {
              setConflict(t('common.errorConflict'))
              try {
                const latest = await getArrangement(group.id, arrangement.id)
                setArrangement(latest)
                setLatestArrangement(latest)
              } catch (err) {
                setError(mutationErrorMessage(err, t))
              }
            }}
            latestArrangement={latestArrangement}
          />
        </section>
      ) : null}

      {!editing ? <>
      <div className="grid grid-cols-1 gap-5">

        <section className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-6" aria-labelledby="resources-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="resources-heading" className="text-lg font-semibold">
              {t('arrangement.resourcesTitle')}
            </h2>
            {showAddResource && arrangement.resources.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => { setResourceDraftDirty(false); setCreatingResource(true) }}>{t('arrangement.addLink')}</Button>
                <Button variant="secondary" onClick={() => { setResourceDraftDirty(false); setCreatingFileResource(true) }}>
                  {t('arrangement.uploadFile')}
                </Button>
              </div>
            ) : null}
          </div>
          <p className="max-w-2xl text-sm text-muted">{t('arrangement.resourcesHint')}</p>

          {arrangement.resources.length === 0 ? (
            <EmptyPanel
              title={t('arrangement.noMaterialsTitle')}
              description={t('arrangement.noMaterialsBody')}
              action={
                showAddResource ? (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => { setResourceDraftDirty(false); setCreatingResource(true) }}>{t('arrangement.addLink')}</Button>
                    <Button variant="secondary" onClick={() => { setResourceDraftDirty(false); setCreatingFileResource(true) }}>
                      {t('arrangement.uploadFile')}
                    </Button>
                  </div>
                ) : null
              }
            />
          ) : (
            <div className="space-y-6">
              {grouped.map((groupItem) => (
                <section key={groupItem.purpose} className="space-y-2" aria-label={formatPurpose(groupItem.purpose, t)}>
                  <PurposeHeading purpose={groupItem.purpose} />
                  <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface-hover px-4">
                    {groupItem.resources.map((resource) => (
                      <li key={resource.id} className="py-3">
                        {editingResourceId === resource.id && isOwner ? (
                          <ResourceEditForm
                            groupId={group.id}
                            arrangementId={arrangement.id}
                            resource={resource}
                            onCancel={() => setEditingResourceId(null)}
                            onSaved={async () => {
                              setEditingResourceId(null)
                              await reloadArrangement()
                            }}
                          />
                        ) : (
                          <ResourceRow
                            groupId={group.id}
                            arrangementId={arrangement.id}
                            songTitle={songTitle}
                            resource={resource}
                            isOwner={isOwner}
                            onEdit={() => setEditingResourceId(resource.id)}
                            onDelete={() => setResourceToDelete(resource)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {isOwner ? (
            <details className="rounded-xl border border-border-subtle bg-surface-hover p-4">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">{t('arrangement.audioToolsTitle')}</summary>
              <div className="mt-3">
                <AudioDigitizer
                  key={arrangement.id}
                  groupId={group.id}
                  arrangement={arrangement}
                  onChanged={reloadArrangement}
                />
              </div>
            </details>
          ) : null}

        </section>

        {showRehearsalSummary ? <aside className="space-y-4 rounded-2xl border border-border-subtle bg-surface-hover p-4 sm:p-6" aria-labelledby="arrangement-music-heading">
          <div className="space-y-5 text-sm">
              {arrangement.defaultKey || arrangement.defaultBpm != null ? <section aria-labelledby="arrangement-tuning-heading" className="space-y-3">
                <h3 id="arrangement-tuning-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {t('arrangement.rehearsalDetailsTitle')}
                </h3>
                <dl className="flex flex-wrap gap-x-8 gap-y-3">
                  {arrangement.defaultKey ? <div><dt className="text-muted">{t('arrangement.keyLabel')}</dt><dd className="font-medium">{arrangement.defaultKey}</dd></div> : null}
                  {arrangement.defaultBpm != null ? <div><dt className="text-muted">{t('arrangement.tempoLabel')}</dt><dd className="font-medium">{arrangement.defaultBpm}</dd></div> : null}
                </dl>
              </section> : null}
              {arrangement.lyrics?.trim() || arrangement.chords?.trim() || arrangement.structure?.trim() || arrangement.notes?.trim() ? <section aria-labelledby="arrangement-music-heading" className="space-y-3">
                <h3 id="arrangement-music-heading" className="text-base font-semibold text-ink">{t('arrangement.rehearsalContentTitle')}</h3>
                <div className={`grid min-w-0 gap-5 ${hasLyrics && hasDistinctChords ? '2xl:grid-cols-2' : 'grid-cols-1'}`}>
                  {hasLyrics ? <div className="min-w-0">
                    <h4 className="font-medium text-muted">{t('arrangement.lyricsLabel')}</h4>
                    <div className="mt-2 max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border-subtle bg-surface p-4 text-base leading-8 text-ink">
                      {arrangement.lyrics}
                    </div>
                  </div> : null}
                  {chordText && chordText !== arrangement.lyrics?.trim() ? <div className="min-w-0">
                    <h4 className="font-medium text-muted">{t('arrangement.chordsDisplayLabel')}</h4>
                    <div className="mt-2">
                      {looksLikeChordPro(chordText) ? (
                        <ChordProView text={chordText} className="max-h-[32rem] space-y-1 overflow-y-auto rounded-xl border border-[var(--color-score-border)] bg-[var(--color-score-paper)] p-4 font-sans" />
                      ) : (
                        <pre className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--color-score-border)] bg-[var(--color-score-paper)] p-4 font-sans text-sm text-[var(--color-score-ink)]">
                          {chordText}
                        </pre>
                      )}
                    </div>
                  </div> : null}
                </div>
              </section> : null}
              {arrangement.structure?.trim() || arrangement.notes?.trim() ? <details className="rounded-xl border border-border-subtle bg-surface p-4">
                <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">{t('arrangement.additionalDetails')}</summary>
                <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                  {arrangement.structure?.trim() ? <div><dt className="font-medium text-muted">{t('arrangement.structureLabel')}</dt><dd className="mt-1 whitespace-pre-wrap">{arrangement.structure}</dd></div> : null}
                  {arrangement.notes?.trim() ? <div><dt className="font-medium text-muted">{t('arrangement.notesLabel')}</dt><dd className="mt-1 whitespace-pre-wrap">{arrangement.notes}</dd></div> : null}
                </dl>
              </details> : null}
          </div>
        </aside> : null}

      </div>

      {arrangement && groupId ? <LyricsExportPanel groupId={groupId} arrangement={arrangement} disabled={false} /> : null}

      {isOwner ? (
        <section
          aria-labelledby="arrangement-danger-heading"
          data-testid="danger-zone"
          className="space-y-3 rounded-2xl border border-error/40 bg-error/5 p-5"
        >
          <h2 id="arrangement-danger-heading" className="text-lg font-semibold text-error-ink">
            {t('common.dangerZone')}
          </h2>
          <Button variant="danger" onClick={() => setConfirmDeleteArrangement(true)}>
            {t('arrangement.deleteArrangement')}
          </Button>
        </section>
      ) : null}
      </> : null}

      <GroupDialog
        open={creatingResource}
        onClose={() => { setCreatingResource(false); setResourceDraftDirty(false) }}
        title={t('arrangement.addLink')}
        description={t('arrangement.resourceDialogHint')}
        size="lg"
        mobileFullscreen
        fitContent
        confirmDiscard={resourceDraftDirty}
        testId="arrangement-link-dialog"
      >
        {(requestClose) => <ResourceCreateForm
            groupId={group.id}
            arrangementId={arrangement.id}
            onDirtyChange={setResourceDraftDirty}
            onCancel={requestClose}
            onCreated={async () => {
              setCreatingResource(false)
              setResourceDraftDirty(false)
              await reloadArrangement()
            }}
          />}
      </GroupDialog>
      <GroupDialog
        open={creatingFileResource}
        onClose={() => { setCreatingFileResource(false); setResourceDraftDirty(false) }}
        title={t('arrangement.uploadFile')}
        description={t('arrangement.resourceDialogHint')}
        size="lg"
        mobileFullscreen
        fitContent
        confirmDiscard={resourceDraftDirty}
        testId="arrangement-upload-dialog"
      >
        {(requestClose) => <FileResourceCreateForm
            groupId={group.id}
            planId={group.planId}
            arrangementId={arrangement.id}
            onDirtyChange={setResourceDraftDirty}
            onCancel={requestClose}
            onCreated={async () => {
              setCreatingFileResource(false)
              setResourceDraftDirty(false)
              await reloadArrangement()
            }}
          />}
      </GroupDialog>

      <ConfirmDialog
        open={confirmCancelEdit}
        title={t('common.unsavedChanges')}
        confirmLabel={t('common.discard')}
        cancelLabel={t('common.cancel')}
        pendingLabel={t('common.discard')}
        onCancel={() => setConfirmCancelEdit(false)}
        onConfirm={cancelArrangementEdit}
      >
        <p>{t('common.discardChanges')}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDeleteArrangement}
        title={t('arrangement.deleteArrTitle')}
        confirmLabel={t('arrangement.deleteArrangement')}
        cancelLabel={t('arrangement.cancel')}
        pendingLabel={t('arrangement.deleting')}
        pending={deletingArrangement}
        onCancel={() => setConfirmDeleteArrangement(false)}
        onConfirm={() => void handleDeleteArrangement()}
      >
        <p>
          {t('arrangement.deleteArrBody')}
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={resourceToDelete != null}
        title={t('arrangement.deleteResTitle')}
        confirmLabel={t('arrangement.deleteResConfirm')}
        cancelLabel={t('arrangement.cancel')}
        pendingLabel={t('arrangement.deleting')}
        pending={deletingResource}
        onCancel={() => setResourceToDelete(null)}
        onConfirm={() => void handleDeleteResource()}
      >
        <p>
          {t('arrangement.deleteResPrefix')}
          {resourceToDelete ? ` “${resourceToDelete.label}”` : ''}{t('arrangement.deleteResSuffix')}
        </p>
      </ConfirmDialog>
    </section>
  )
}

function ResourceRow({
  groupId,
  arrangementId,
  songTitle,
  resource,
  isOwner,
  onEdit,
  onDelete,
}: {
  groupId: string
  arrangementId: string
  songTitle: string | null
  resource: ResourceSummary
  isOwner: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const isFile = resource.kind === 'file'
  const downloadHref = isFile
    ? resourceContentUrl(groupId, arrangementId, resource.id)
    : null
  const externalUrl = safeExternalResourceUrl(resource.url)
  const { t } = useT()
  const audioPlayer = useAudioPlayer()
  const playable = isPlayableAudioResource(resource) && Boolean(downloadHref || externalUrl)
  const isCurrentTrack = audioPlayer.currentTrack?.id === resource.id
  const playResource = () => {
    if (!playable) return
    if (isCurrentTrack) {
      audioPlayer.togglePlay()
      return
    }
    audioPlayer.playTrack({
      id: resource.id,
      title: resource.label,
      artist: songTitle ?? undefined,
      url: downloadHref ?? externalUrl!,
    })
  }

  return (
    <div className="space-y-2">
      <p className="font-semibold text-ink">{resource.label}</p>
      {resource.part ? <p className="text-sm text-muted">{t('arrangement.partPrefix')}{resource.part}</p> : null}
      {resource.note ? <p className="text-sm text-muted">{resource.note}</p> : null}
      {resource.url ? (
        <p>
          {externalUrl ? (
            <a
              className="break-all font-medium text-primary-ink no-underline hover:underline"
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {resource.url}
            </a>
          ) : (
            <span className="break-all text-muted">{resource.url}</span>
          )}
        </p>
      ) : null}
      {isFile && downloadHref ? (
        <p className="text-sm text-muted">
          {resource.originalFileName ?? t('arrangement.fileFallback')}
          {resource.byteSize != null ? ` · ${formatByteSize(resource.byteSize)}` : ''}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {playable ? (
          <Button variant="primary" size="sm" onClick={playResource} aria-label={t(isCurrentTrack && audioPlayer.isPlaying ? 'player.pauseTrack' : 'player.playTrack', { title: resource.label })}>
            {isCurrentTrack && audioPlayer.isPlaying ? <Pause className="mr-2 h-4 w-4" aria-hidden="true" /> : <Play className="mr-2 h-4 w-4" aria-hidden="true" />}
            {t(isCurrentTrack && audioPlayer.isPlaying ? 'player.pause' : 'player.play')}
          </Button>
        ) : null}
        {downloadHref ? (
          <a className={buttonVariants({ variant: 'primary', size: 'sm' })} href={downloadHref}>
            {t('arrangement.download')}
          </a>
        ) : null}
        {isOwner ? (
          <>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              {t('arrangement.edit')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-error-ink hover:text-error-ink"
              onClick={onDelete}
            >
              {t('arrangement.delete')}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function ArrangementEditForm({
  arrangement,
  groupId,
  songTitle,
  onCancelAttempt,
  onSaved,
  onConflict,
  latestArrangement,
}: {
  arrangement: ArrangementDetail
  groupId: string
  songTitle: string
  onCancelAttempt: (dirty: boolean) => void
  onSaved: (arrangement: ArrangementDetail) => Promise<void>
  onConflict: () => Promise<void>
  latestArrangement: ArrangementDetail | null
}) {
  const [label, setLabel] = useState(arrangement.label)
  const [defaultKey, setDefaultKey] = useState(arrangement.defaultKey ?? '')
  const [defaultBpm, setDefaultBpm] = useState(
    arrangement.defaultBpm != null ? String(arrangement.defaultBpm) : '',
  )
  const [lyrics, setLyrics] = useState(arrangement.lyrics ?? '')
  const [chords, setChords] = useState(arrangement.chords ?? '')
  const [structure, setStructure] = useState(arrangement.structure ?? '')
  const [notes, setNotes] = useState(arrangement.notes ?? '')
  const [timingTimeline, setTimingTimeline] = useState<ChordTimingTimeline>(() =>
    parseChordTimingTimeline(arrangement.chordTimingJson),
  )
  const [importError, setImportError] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [composeGenre, setComposeGenre] = useState('pop')
  const [composeKey, setComposeKey] = useState('C')
  const [composeIdea, setComposeIdea] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [reviewedLatest, setReviewedLatest] = useState(false)
  const [editorMode, setEditorMode] = useState<ArrangementEditorMode>('lyrics')
  const { t } = useT()
  useEffect(() => setReviewedLatest(false), [latestArrangement?.version])
  const audioTracks = useMemo(
    () => listPracticeAudioTracks(arrangement.resources, groupId, arrangement.id),
    [arrangement.resources, groupId, arrangement.id],
  )
  const composeBrief = { genre: composeGenre, key: composeKey, idea: composeIdea }
  const editorCopy = {
    lyrics: {
      title: t('arrangement.editorTitleLyrics'),
      hint: t('arrangement.editorHintLyrics'),
    },
    chords: {
      title: t('arrangement.editorTitleChords'),
      hint: t('arrangement.editorHintChords'),
    },
    timing: {
      title: t('arrangement.editorTitleTiming'),
      hint: t('arrangement.editorHintTiming'),
    },
  }[editorMode]
  const hasDraftChanges = label !== arrangement.label ||
    defaultKey !== (arrangement.defaultKey ?? '') ||
    defaultBpm !== (arrangement.defaultBpm != null ? String(arrangement.defaultBpm) : '') ||
    lyrics !== (arrangement.lyrics ?? '') ||
    chords !== (arrangement.chords ?? '') ||
    structure !== (arrangement.structure ?? '') ||
    notes !== (arrangement.notes ?? '') ||
    serializeChordTimingTimeline(timingTimeline) !== serializeChordTimingTimeline(parseChordTimingTimeline(arrangement.chordTimingJson))

  function onComposeGenerate() {
    setChords(composeChordPro(composeBrief))
  }

  function onComposeVary() {
    setChords(varyProgression(chords, composeBrief))
  }

  function onComposeRewriteVerse() {
    setChords(rewriteVerse(chords, composeBrief))
  }

  function onImportChordPro(file: File | null) {
    setImportFile(file)
    if (!file) return
    setImportError(false)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setImportError(true)
        return
      }
      const extension = file.name.split('.').at(-1)?.toLowerCase()
      setLyrics('')
      setChords(extension === 'chord' || extension === 'crd'
        ? importChordSheetText(reader.result)
        : reader.result)
    }
    reader.onerror = () => {
      setImportError(true)
    }
    reader.readAsText(file)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const lineCount = splitChordProLines(chords).length
    const clippedTimeline = {
      ...timingTimeline,
      lineMarks: timingTimeline.lineMarks.filter((mark) => mark.lineIndex < lineCount),
      wordMarks: timingTimeline.wordMarks.filter((mark) => mark.lineIndex < lineCount),
    }

    const payload: Parameters<typeof updateArrangement>[2] = {
      expectedVersion: latestArrangement?.version ?? arrangement.version,
      label: label.trim(),
      defaultKey,
      lyrics,
      chords,
      structure,
      notes,
      chordTimingJson: serializeChordTimingTimeline(clippedTimeline),
    }

    if (defaultBpm.trim()) {
      const parsed = Number(defaultBpm)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 400) {
        setError(t('arrangement.tempoInvalid'))
        setPending(false)
        return
      }
      payload.defaultBpm = parsed
    }

    try {
      const updated = await updateArrangement(groupId, arrangement.id, payload)
      await onSaved(updated)
    } catch (err) {
      if (isConflictError(err)) {
        await onConflict()
      } else {
        setError(mutationErrorMessage(err, t))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <ProblemAlert message={error} />
      {latestArrangement ? (
        <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-semibold text-ink">{t('arrangement.latestVersionAvailable')}</p>
          <details className="rounded-lg border border-border-subtle bg-surface p-3">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary-ink">{t('arrangement.reviewLatestVersion')}</summary>
            <dl className="max-h-72 space-y-2 overflow-y-auto pt-2">
              {([
                [t('arrangement.labelLabel'), latestArrangement.label],
                [t('arrangement.keyOptional'), latestArrangement.defaultKey || '—'],
                [t('arrangement.bpmLabel'), latestArrangement.defaultBpm == null ? '—' : String(latestArrangement.defaultBpm)],
                [t('arrangement.lyricsLabel'), latestArrangement.lyrics || '—'],
                [t('arrangement.chordsLabel'), latestArrangement.chords || '—'],
                [t('arrangement.structureLabel'), latestArrangement.structure || '—'],
                [t('arrangement.notesLabel'), latestArrangement.notes || '—'],
              ]).map(([field, value]) => <div key={field}><dt className="font-medium text-muted">{field}</dt><dd className="whitespace-pre-wrap break-words text-ink">{value}</dd></div>)}
            </dl>
          </details>
          <label className="flex min-h-11 items-center gap-2 font-medium text-ink">
            <input type="checkbox" checked={reviewedLatest} onChange={(event) => setReviewedLatest(event.target.checked)} />
            {t('arrangement.confirmReviewLatest')}
          </label>
        </div>
      ) : null}
      <div role="group" aria-label={t('arrangement.editorModeLabel')} className="grid grid-cols-3 gap-1 rounded-2xl border border-border-subtle bg-surface-hover p-1.5 sm:gap-2 sm:p-2">
        {([
          ['lyrics', t('arrangement.editorLyrics')],
          ['chords', t('arrangement.editorChords')],
          ['timing', t('arrangement.editorTiming')],
        ] as const).map(([mode, label]) => (
          <button key={mode} className={`min-h-11 w-full min-w-0 rounded-xl px-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none sm:px-4 ${editorMode === mode ? 'bg-primary-strong text-primary-foreground shadow-sm' : 'bg-transparent text-muted hover:bg-surface hover:text-ink'}`} type="button" aria-pressed={editorMode === mode} data-testid={`arrangement-editor-mode-${mode}`} onClick={() => setEditorMode(mode)}>
            {label}
          </button>
        ))}
      </div>
      <section className="space-y-3" aria-labelledby="arrangement-details-heading">
        <h3 id="arrangement-details-heading" className="sr-only">{t('arrangement.editArrangement')}</h3>
        <Field label={t('arrangement.labelLabel')}>
          <input
            className={fieldClass}
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={200}
          />
        </Field>
        <details className="rounded-xl border border-border-subtle bg-surface-hover/60 px-3 sm:px-4">
          <summary className="flex min-h-12 cursor-pointer flex-col justify-center gap-0.5 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <span className="font-medium text-ink">{t('arrangement.optionalVersionSettings')}</span>
            <span className="text-xs text-muted">{t('arrangement.optionalVersionSettingsHint')}</span>
          </summary>
          <div className="grid gap-4 border-t border-border-subtle py-3 sm:grid-cols-2">
          <Field label={t('arrangement.keyOptional')} hint={t('arrangement.clearKeyHint')}>
            <input
              className={fieldClass}
              value={defaultKey}
              onChange={(e) => setDefaultKey(e.target.value)}
              maxLength={32}
            />
          </Field>
          <Field label={t('arrangement.bpmLabel')} hint={t('arrangement.keepTempoHint')}>
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
          </div>
        </details>
      </section>
      {editorMode === 'chords' && arrangement.resources.some((resource) => resource.purpose === 'chart' && resource.kind === 'file') ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-subtle bg-surface-hover p-4" data-testid="existing-chart-reference">
          <div className="min-w-0 space-y-1">
            <h4 className="font-semibold text-ink">{t('arrangement.existingChartTitle')}</h4>
            <p className="text-sm text-muted">{t('arrangement.existingChartHint')}</p>
            <p className="truncate text-xs text-muted">
              {arrangement.resources.find((resource) => resource.purpose === 'chart' && resource.kind === 'file')?.originalFileName ?? t('arrangement.fileFallback')}
            </p>
          </div>
          {arrangement.resources.filter((resource) => resource.purpose === 'chart' && resource.kind === 'file').map((resource) => (
            <a key={resource.id} className={buttonVariants({ variant: 'secondary', size: 'sm' })} href={resourceContentUrl(groupId, arrangement.id, resource.id)}>
              {t('arrangement.openExistingChart')}
            </a>
          ))}
        </section>
      ) : null}

      <VisualChordEditor
        groupId={groupId}
        arrangementId={arrangement.id}
        arrangementLabel={label}
        defaultKey={defaultKey}
        lyrics={lyrics}
        chords={chords}
        onLyricsChange={setLyrics}
        onChordsChange={setChords}
        timingTimeline={timingTimeline}
        onTimingChange={setTimingTimeline}
        audioTracks={audioTracks}
        importFile={importFile}
        importError={importError}
        onImportFileChange={onImportChordPro}
        mode={editorMode}
        editorTitle={editorCopy.title}
        editorHint={editorCopy.hint}
        additionalLyricsImport={editorMode === 'lyrics' ? (
          <LrcPanel
            groupId={groupId}
            arrangement={arrangement}
            songTitle={songTitle}
            onDraftImported={({ lyrics: importedLyrics, chordTimingJson }) => {
              setLyrics(importedLyrics)
              setChords(importedLyrics)
              setTimingTimeline(parseChordTimingTimeline(chordTimingJson))
              setError(null)
            }}
          />
        ) : null}
      />
      {editorMode === 'chords' ? <>
      <details className="rounded-xl border border-border-subtle bg-surface p-4" data-testid="chordpro-compose">
        <summary className="cursor-pointer font-semibold text-ink">{t('arrangement.advancedToolsTitle')}</summary>
        <div className="mt-4 space-y-4">
          <p className="text-sm font-semibold text-ink">{t('arrangement.composeTitle')}</p>
          <p className="text-xs text-muted">
            {t('arrangement.composeHint')}
          </p>
          <Field label={t('arrangement.genreLabel')}>
            <input
              className={fieldClass}
              value={composeGenre}
              onChange={(e) => setComposeGenre(e.target.value)}
              data-testid="compose-genre"
              maxLength={64}
            />
          </Field>
          <Field label={t('arrangement.keyFieldLabel')}>
            <input
              className={fieldClass}
              value={composeKey}
              onChange={(e) => setComposeKey(e.target.value)}
              data-testid="compose-key"
              maxLength={16}
            />
          </Field>
          <Field label={t('arrangement.ideaLabel')}>
            <input
              className={fieldClass}
              value={composeIdea}
              onChange={(e) => setComposeIdea(e.target.value)}
              data-testid="compose-idea"
              maxLength={200}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onComposeGenerate}
              data-testid="compose-generate"
            >
              {t('arrangement.generateSong')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onComposeVary}
              data-testid="compose-vary-progression"
              disabled={!chords.includes('{start_of_')}
            >
              {t('arrangement.varyProgression')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onComposeRewriteVerse}
              data-testid="compose-rewrite-verse"
              disabled={!chords.includes('{start_of_verse}')}
            >
              {t('arrangement.rewriteVerse')}
            </Button>
          </div>
          {chords.trim() ? (
            <div className="space-y-2 pt-1">
              <p className="text-sm font-medium text-ink">{t('arrangement.previewLabel')}</p>
              {looksLikeChordPro(chords) ? (
                <ChordProView
                  text={chords}
                  testId="chords-preview"
                  className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[var(--color-score-border)] bg-[var(--color-score-paper)] p-3 font-sans"
                />
              ) : (
                <pre
                  className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--color-score-border)] bg-[var(--color-score-paper)] p-3 font-sans text-sm text-[var(--color-score-ink)]"
                  data-testid="chords-preview"
                >
                  {chords}
                </pre>
              )}
            </div>
          ) : null}
        </div>
      </details>
      <details className="rounded-xl border border-border-subtle bg-surface p-4">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">{t('arrangement.additionalDetails')}</summary>
        <div className="mt-3 space-y-4">
      <Field label={t('arrangement.structureOptional')}>
        <textarea
          className={fieldClass}
          rows={2}
          value={structure}
          onChange={(e) => setStructure(e.target.value)}
        />
      </Field>
      <Field label={t('arrangement.notesOptional')}>
        <textarea className={fieldClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
        </div>
      </details>
      </> : null}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border-subtle bg-surface/95 px-4 py-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_20px_rgba(0,0,0,.08)] backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-nowrap items-center gap-1 sm:gap-3">
        <Button className="px-2 text-xs sm:px-4 sm:text-sm" type="submit" disabled={pending || Boolean(latestArrangement && !reviewedLatest)}>
          {pending ? t('arrangement.saving') : t('arrangement.save')}
        </Button>
        <Button className="px-2 text-xs sm:px-4 sm:text-sm" variant="secondary" disabled={pending} onClick={() => onCancelAttempt(hasDraftChanges)}>
          {t('arrangement.cancel')}
        </Button>
      </div>
      </div>
    </form>
  )
}

function ResourceCreateForm({
  groupId,
  arrangementId,
  onCreated,
  onCancel,
  onDirtyChange,
}: {
  groupId: string
  arrangementId: string
  onCreated: () => Promise<void>
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [purpose, setPurpose] = useState<ResourcePurpose>('practice')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [part, setPart] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { t } = useT()
  useEffect(() => onDirtyChange(Boolean(label || url || part || note)), [label, url, part, note, onDirtyChange])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!safeExternalResourceUrl(url)) {
      setError(t('resources.urlInvalid'))
      return
    }
    setPending(true)
    setError(null)
    try {
      await createLinkResource(groupId, arrangementId, {
        purpose,
        label: label.trim(),
        url: url.trim(),
        part: part.trim() || null,
        note: note.trim() || null,
      })
      await onCreated()
    } catch (err) {
      setError(mutationErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <ProblemAlert message={error} />
      <Field label={t('arrangement.purposeLabel')}>
        <select
          className={fieldClass}
          required
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as ResourcePurpose)}
        >
          {RESOURCE_PURPOSE_ORDER.map((value) => (
            <option key={value} value={value}>
              {formatPurpose(value, t)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('arrangement.resourceLabelLabel')}>
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label={t('arrangement.urlLabel')}>
        <input
          className={fieldClass}
          type="url"
          required
          value={url}
          maxLength={2000}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('resources.urlPlaceholder')}
        />
      </Field>
      <Field label={t('arrangement.partOptional')}>
        <input className={fieldClass} value={part} onChange={(e) => setPart(e.target.value)} maxLength={100} />
      </Field>
      <Field label={t('arrangement.noteOptional')}>
        <textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? t('arrangement.creating') : t('arrangement.createLink')}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          {t('arrangement.cancel')}
        </Button>
      </FormActions>
    </form>
  )
}

function FileResourceCreateForm({
  groupId,
  planId,
  arrangementId,
  onCreated,
  onCancel,
  onDirtyChange,
}: {
  groupId: string
  planId: string
  arrangementId: string
  onCreated: () => Promise<void>
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [purpose, setPurpose] = useState<ResourcePurpose>('practice')
  const [label, setLabel] = useState('')
  const [part, setPart] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { t } = useT()
  useEffect(() => onDirtyChange(Boolean(label || part || note || file)), [label, part, note, file, onDirtyChange])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!file) {
      setError(t('arrangement.selectFile'))
      return
    }
    const maxBytes = resourceUploadLimit(planId, purpose)
    const clientError = validateFileForUpload(file, t, maxBytes)
    if (clientError) {
      setError(clientError)
      return
    }
    setPending(true)
    setError(null)
    try {
      await createFileResource(groupId, arrangementId, {
        purpose,
        label: label.trim(),
        file,
        part: part.trim() || null,
        note: note.trim() || null,
      })
      await onCreated()
    } catch (err) {
      setError(fileUploadErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={onSubmit}
      noValidate
      aria-busy={pending}
    >
      <ProblemAlert message={error} />
      {pending ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-ink"
          data-testid="file-upload-pending"
        >
          {t('arrangement.uploadPending')}
        </p>
      ) : null}
      <Field label={t('arrangement.purposeLabel')}>
        <select
          className={fieldClass}
          required
          value={purpose}
          disabled={pending}
          onChange={(e) => setPurpose(e.target.value as ResourcePurpose)}
        >
          {RESOURCE_PURPOSE_ORDER.map((value) => (
            <option key={value} value={value}>
              {formatPurpose(value, t)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('arrangement.resourceLabelLabel')}>
        <input
          className={fieldClass}
          required
          value={label}
          disabled={pending}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </Field>
      <FileDropzone
        title={t('arrangement.fileLabel')}
        description={t('arrangement.fileHint')}
        accept=".pdf,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.txt,application/pdf,image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/mp4,text/plain"
        file={file}
        maxSizeBytes={(selectedFile) => resourceUploadLimit(
          planId,
          isAudioUpload(selectedFile) ? 'audio' : purpose,
        )}
        onFileChange={(next) => {
          if (next && isAudioUpload(next)) setPurpose('audio')
          setFile(next)
          setError(null)
        }}
        disabled={pending}
        testId="arrangement-file-dropzone"
      />
      <Field label={t('arrangement.partOptional')}>
        <input
          className={fieldClass}
          value={part}
          disabled={pending}
          onChange={(e) => setPart(e.target.value)}
          maxLength={100}
        />
      </Field>
      <Field label={t('arrangement.noteOptional')}>
        <textarea
          className={fieldClass}
          rows={2}
          value={note}
          disabled={pending}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? t('arrangement.uploading') : t('arrangement.uploadFile')}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          {t('arrangement.cancel')}
        </Button>
      </FormActions>
    </form>
  )
}

function ResourceEditForm({
  groupId,
  arrangementId,
  resource,
  onCancel,
  onSaved,
}: {
  groupId: string
  arrangementId: string
  resource: ResourceSummary
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const [purpose, setPurpose] = useState<ResourcePurpose>(
    (RESOURCE_PURPOSE_ORDER.includes(resource.purpose as ResourcePurpose)
      ? resource.purpose
      : 'other') as ResourcePurpose,
  )
  const [label, setLabel] = useState(resource.label)
  const [part, setPart] = useState(resource.part ?? '')
  const [note, setNote] = useState(resource.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { t } = useT()
  const externalUrl = safeExternalResourceUrl(resource.url)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await updateLinkResource(groupId, arrangementId, resource.id, {
        purpose,
        label: label.trim(),
        part,
        note,
      })
      await onSaved()
    } catch (err) {
      setError(mutationErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <h4 className="font-semibold">{t('arrangement.editResourceTitle')}</h4>
      {resource.url ? (
        <p className="text-sm text-muted">
          {t('arrangement.urlLockedPrefix')}{' '}
          {externalUrl ? (
            <a
              className="break-all font-medium text-primary-ink no-underline hover:underline"
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {resource.url}
            </a>
          ) : (
            <span className="break-all">{resource.url}</span>
          )}
        </p>
      ) : null}
      {resource.kind === 'file' && resource.originalFileName ? (
        <p className="text-sm text-muted">
          {t('arrangement.fileLockedPrefix')} {resource.originalFileName}
        </p>
      ) : null}
      <ProblemAlert message={error} />
      <Field label={t('arrangement.purposeLabel')}>
        <select
          className={fieldClass}
          required
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as ResourcePurpose)}
        >
          {RESOURCE_PURPOSE_ORDER.map((value) => (
            <option key={value} value={value}>
              {formatPurpose(value, t)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('arrangement.resourceLabelLabel')}>
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label={t('arrangement.partOptional')} hint={t('arrangement.clearPartHint')}>
        <input className={fieldClass} value={part} onChange={(e) => setPart(e.target.value)} maxLength={100} />
      </Field>
      <Field label={t('arrangement.noteOptional')} hint={t('arrangement.clearNoteHint')}>
        <textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? t('arrangement.saving') : t('arrangement.saveShort')}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          {t('arrangement.cancel')}
        </Button>
      </FormActions>
    </form>
  )
}
