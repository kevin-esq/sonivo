import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import { ChordTimingEditor } from './ChordTimingEditor'
import { LrcPanel } from './LrcPanel'
import { AudioDigitizer } from './AudioDigitizer'
import { looksLikeChordPro } from './chordPro'
import {
  parseChordTimingJson,
  serializeChordTimingJson,
  splitChordProLines,
  type ChordTimingMark,
} from './chordTiming'
import { listPracticeAudioTracks } from './pickPracticeAudio'
import {
  digitizeToChordPro,
  listChordCursors,
  nudgeChord,
  parseChordProToDigitizer,
  serializeDigitizerDocument,
} from './chordProDigitizer'
import { composeChordPro, varyProgression, rewriteVerse } from './composeChordPro'
import { fileUploadErrorMessage, validateFileForUpload } from './fileUploadErrors'
import {
  CONFLICT_MESSAGE,
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

export function ArrangementDetailPage({ user }: { user: CurrentUser }) {
  const { groupId, arrangementId } = useParams()
  const navigate = useNavigate()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [arrangement, setArrangement] = useState<ArrangementDetail | null | undefined>(undefined)
  const [songTitle, setSongTitle] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [creatingResource, setCreatingResource] = useState(false)
  const [creatingFileResource, setCreatingFileResource] = useState(false)
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null)
  const [confirmDeleteArrangement, setConfirmDeleteArrangement] = useState(false)
  const [deletingArrangement, setDeletingArrangement] = useState(false)
  const [resourceToDelete, setResourceToDelete] = useState<ResourceSummary | null>(null)
  const [deletingResource, setDeletingResource] = useState(false)
  const { t } = useT()

  const isOwner = canManageContentRole(group?.role)

  async function reloadArrangement() {
    if (!groupId || !arrangementId) return
    const result = await getArrangement(groupId, arrangementId)
    setArrangement(result)
    try {
      const song = await getSong(groupId, result.songId)
      setSongTitle(song.title)
    } catch {
      setSongTitle(null)
    }
  }

  useEffect(() => {
    if (!groupId || !arrangementId || !group) return
    let cancelled = false
    async function load() {
      setArrangement(undefined)
      setSongTitle(null)
      setError(null)
      setConflict(null)
      try {
        const result = await getArrangement(groupId!, arrangementId!)
        if (cancelled) return
        setArrangement(result)
        try {
          const song = await getSong(groupId!, result.songId)
          if (!cancelled) setSongTitle(song.title)
        } catch {
          if (!cancelled) setSongTitle(null)
        }
      } catch (err) {
        if (cancelled) return
        setArrangement(null)
        setError(mutationErrorMessage(err))
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
      navigate(`/groups/${groupId}/songs/${arrangement.songId}`)
    } catch (err) {
      if (isConflictError(err)) {
        setConflict(CONFLICT_MESSAGE)
        setConfirmDeleteArrangement(false)
        try {
          await reloadArrangement()
        } catch (reloadErr) {
          setError(mutationErrorMessage(reloadErr))
        }
      } else {
        setError(mutationErrorMessage(err))
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
      setError(mutationErrorMessage(err))
      setResourceToDelete(null)
    } finally {
      setDeletingResource(false)
    }
  }

  if (group === undefined) {
    return <p aria-live="polite">{t('arreglo.loading')}</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="font-semibold text-primary-ink no-underline hover:underline" to="/">
          {t('arreglo.myGroups')}
        </Link>
      </div>
    )
  }

  if (arrangement === undefined) {
    return <p aria-live="polite">{t('arreglo.loading')}</p>
  }

  if (arrangement === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? t('arreglo.notFound')} />
        <Link
          className="font-semibold text-primary-ink no-underline hover:underline"
          to={`/groups/${group.id}/library`}
        >
          {t('arreglo.library')}
        </Link>
      </div>
    )
  }

  const grouped = groupResourcesByPurpose(arrangement.resources)
  const showAddResource = isOwner && !creatingResource && !creatingFileResource
  const songHref = `/groups/${group.id}/songs/${arrangement.songId}`
  const hasChart = arrangement.resources.some((resource) => resource.purpose === 'chart')
  const resourceCountLabel =
    arrangement.resources.length === 0
      ? t('listas.noResources')
      : plural(arrangement.resources.length, t('listas.resourceOne'), t('listas.resourcesMany'))

  return (
    <section className="space-y-6" aria-labelledby="arrangement-heading">
      <header data-testid="arrangement-hero" className="space-y-3">
        <PageBreadcrumb
          items={[
            { to: `/groups/${group.id}`, label: group.name },
            { to: `/groups/${group.id}/library`, label: t('listas.title') },
            { to: songHref, label: songTitle ?? t('arreglo.songFallback') },
            { label: arrangement.label },
          ]}
        />
        <div className="space-y-2">
          <h1 id="arrangement-heading" className="text-3xl font-bold tracking-tight text-ink">
            {arrangement.label}
          </h1>
          <p className="text-sm text-muted">
            {t('arreglo.ofPrefix')}
            {songTitle ? (
              <Link className="font-medium text-primary-ink no-underline hover:underline" to={songHref}>
                {songTitle}
              </Link>
            ) : (
              t('arreglo.thisSong')
            )}
            {arrangement.defaultKey ? ` · ${arrangement.defaultKey}` : ''}
            {arrangement.defaultBpm != null ? ` · ${arrangement.defaultBpm} BPM` : ''}
            {!isOwner ? ` · ${t('arreglo.readonly')}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <ReadinessChip
              testId="arrangement-resource-count"
              tone={arrangement.resources.length === 0 ? 'neutral' : 'ok'}
            >
              {resourceCountLabel}
            </ReadinessChip>
            <ReadinessChip testId="arrangement-chart-chip" tone={hasChart ? 'accent' : 'neutral'}>
              {hasChart ? t('listas.hasChart') : t('listas.noChart')}
            </ReadinessChip>
          </div>
          <div className="pt-1">
            <Link
              className={buttonVariants({ variant: 'primary' })}
              to={`/groups/${group.id}/arrangements/${arrangement.id}/practice`}
            >
              {t('arreglo.practice')}
            </Link>
          </div>
        </div>
      </header>

      <ProblemAlert message={error} />
      <ConflictAlert message={conflict} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="space-y-4" aria-labelledby="resources-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="resources-heading" className="text-lg font-semibold">
              {t('arreglo.resourcesTitle')}
            </h2>
            {showAddResource && arrangement.resources.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setCreatingResource(true)}>{t('arreglo.addLink')}</Button>
                <Button variant="secondary" onClick={() => setCreatingFileResource(true)}>
                  {t('arreglo.uploadFile')}
                </Button>
              </div>
            ) : null}
          </div>
          <p className="text-sm text-muted">
            {t('arreglo.resourcesHint')}
          </p>

          {arrangement.resources.length === 0 && !creatingResource && !creatingFileResource ? (
            <EmptyPanel
              title={t('arreglo.noMaterialsTitle')}
              description={t('arreglo.noMaterialsBody')}
              action={
                showAddResource ? (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setCreatingResource(true)}>{t('arreglo.addLink')}</Button>
                    <Button variant="secondary" onClick={() => setCreatingFileResource(true)}>
                      {t('arreglo.uploadFile')}
                    </Button>
                  </div>
                ) : null
              }
            />
          ) : (
            <div className="space-y-6">
              {grouped.map((groupItem) => (
                <section key={groupItem.purpose} className="space-y-2" aria-label={formatPurpose(groupItem.purpose)}>
                  <PurposeHeading purpose={groupItem.purpose} />
                  <ul className="divide-y divide-border-subtle">
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
            <AudioDigitizer
              key={arrangement.id}
              groupId={group.id}
              arrangement={arrangement}
              onChanged={reloadArrangement}
            />
          ) : null}

          {isOwner && creatingResource ? (
            <ResourceCreateForm
              groupId={group.id}
              arrangementId={arrangement.id}
              onCancel={() => setCreatingResource(false)}
              onCreated={async () => {
                setCreatingResource(false)
                await reloadArrangement()
              }}
            />
          ) : null}

          {isOwner && creatingFileResource ? (
            <FileResourceCreateForm
              groupId={group.id}
              arrangementId={arrangement.id}
              onCancel={() => setCreatingFileResource(false)}
              onCreated={async () => {
                setCreatingFileResource(false)
                await reloadArrangement()
              }}
            />
          ) : null}
        </section>

        <aside className="space-y-4 rounded-2xl border border-border-subtle bg-surface-hover p-5 shadow-sm">
          {editing && isOwner ? (
            <ArrangementEditForm
              arrangement={arrangement}
              groupId={group.id}
              onCancel={() => setEditing(false)}
              onSaved={async (next) => {
                setArrangement(next)
                setEditing(false)
                setConflict(null)
              }}
              onConflict={async () => {
                setConflict(CONFLICT_MESSAGE)
                setEditing(false)
                try {
                  await reloadArrangement()
                } catch (err) {
                  setError(mutationErrorMessage(err))
                }
              }}
            />
          ) : (
            <div className="space-y-5 text-sm">
              <section aria-labelledby="arrangement-tuning-heading" className="space-y-3">
                <h3 id="arrangement-tuning-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {t('listas.tuningTitle')}
                </h3>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-muted">{t('arreglo.keyLabel')}</dt>
                    <dd className="font-medium">{arrangement.defaultKey ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('arreglo.tempoLabel')}</dt>
                    <dd className="font-medium">{arrangement.defaultBpm ?? '—'}</dd>
                  </div>
                </dl>
              </section>
              <section aria-labelledby="arrangement-music-heading" className="space-y-3">
                <h3 id="arrangement-music-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {t('listas.musicTitle')}
                </h3>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-muted">{t('arreglo.lyricsLabel')}</dt>
                    <dd className="whitespace-pre-wrap font-medium">{arrangement.lyrics ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('arreglo.chordsLabel')}</dt>
                    <dd className="whitespace-pre-wrap font-medium">{arrangement.chords ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('arreglo.structureLabel')}</dt>
                    <dd className="whitespace-pre-wrap font-medium">{arrangement.structure ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('arreglo.notesLabel')}</dt>
                    <dd className="whitespace-pre-wrap font-medium">{arrangement.notes ?? '—'}</dd>
                  </div>
                </dl>
              </section>
            </div>
          )}

          {isOwner && !editing ? (
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {t('arreglo.editArrangement')}
              </Button>
            </div>
          ) : null}
        </aside>
      </div>

      {isOwner && arrangement && groupId ? (
        <LrcPanel groupId={groupId} arrangement={arrangement} onApplied={setArrangement} />
      ) : null}

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
            {t('arreglo.deleteArrangement')}
          </Button>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmDeleteArrangement}
        title={t('arreglo.deleteArrTitle')}
        confirmLabel={t('arreglo.deleteArrangement')}
        cancelLabel={t('arreglo.cancel')}
        pendingLabel={t('arreglo.deleting')}
        pending={deletingArrangement}
        onCancel={() => setConfirmDeleteArrangement(false)}
        onConfirm={() => void handleDeleteArrangement()}
      >
        <p>
          {t('arreglo.deleteArrBody')}
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={resourceToDelete != null}
        title={t('arreglo.deleteResTitle')}
        confirmLabel={t('arreglo.deleteResConfirm')}
        cancelLabel={t('arreglo.cancel')}
        pendingLabel={t('arreglo.deleting')}
        pending={deletingResource}
        onCancel={() => setResourceToDelete(null)}
        onConfirm={() => void handleDeleteResource()}
      >
        <p>
          {t('arreglo.deleteResPrefix')}
          {resourceToDelete ? ` “${resourceToDelete.label}”` : ''}{t('arreglo.deleteResSuffix')}
        </p>
      </ConfirmDialog>
    </section>
  )
}

function ResourceRow({
  groupId,
  arrangementId,
  resource,
  isOwner,
  onEdit,
  onDelete,
}: {
  groupId: string
  arrangementId: string
  resource: ResourceSummary
  isOwner: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const isFile = resource.kind === 'file'
  const downloadHref = isFile
    ? resourceContentUrl(groupId, arrangementId, resource.id)
    : null
  const { t } = useT()

  return (
    <div className="space-y-2">
      <p className="font-semibold text-ink">{resource.label}</p>
      {resource.part ? <p className="text-sm text-muted">{t('arreglo.partPrefix')}{resource.part}</p> : null}
      {resource.note ? <p className="text-sm text-muted">{resource.note}</p> : null}
      {resource.url ? (
        <p>
          <a
            className="break-all font-medium text-primary-ink no-underline hover:underline"
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {resource.url}
          </a>
        </p>
      ) : null}
      {isFile && downloadHref ? (
        <p className="text-sm text-muted">
          {resource.originalFileName ?? t('arreglo.fileFallback')}
          {resource.byteSize != null ? ` · ${formatByteSize(resource.byteSize)}` : ''}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {downloadHref ? (
          <a className={buttonVariants({ variant: 'primary', size: 'sm' })} href={downloadHref}>
            {t('arreglo.download')}
          </a>
        ) : null}
        {isOwner ? (
          <>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              {t('arreglo.edit')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-error-ink hover:text-error-ink"
              onClick={onDelete}
            >
              {t('arreglo.delete')}
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
  onCancel,
  onSaved,
  onConflict,
}: {
  arrangement: ArrangementDetail
  groupId: string
  onCancel: () => void
  onSaved: (arrangement: ArrangementDetail) => Promise<void>
  onConflict: () => Promise<void>
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
  const [timingMarks, setTimingMarks] = useState<ChordTimingMark[]>(() =>
    parseChordTimingJson(arrangement.chordTimingJson),
  )
  const [importError, setImportError] = useState(false)
  const [digitizerLyrics, setDigitizerLyrics] = useState('')
  const [digitizerChords, setDigitizerChords] = useState('')
  const [selectedChordIndex, setSelectedChordIndex] = useState(0)
  const [composeGenre, setComposeGenre] = useState('pop')
  const [composeKey, setComposeKey] = useState('C')
  const [composeIdea, setComposeIdea] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [maxMs, setMaxMs] = useState<number | undefined>(undefined)
  const { t } = useT()

  // Load practice audio tracks to get duration for timing validation
  useEffect(() => {
    let cancelled = false
    const tracks = listPracticeAudioTracks(arrangement.resources, groupId, arrangement.id)
    if (tracks.length > 0) {
      const audio = new Audio(tracks[0].src)
      audio.addEventListener('loadedmetadata', () => {
        if (!cancelled && Number.isFinite(audio.duration) && audio.duration > 0) {
          setMaxMs(Math.round(audio.duration * 1000))
        }
      })
      audio.load()
    }
    return () => {
      cancelled = true
    }
  }, [arrangement.resources, groupId, arrangement.id])

  const digitizerDoc = parseChordProToDigitizer(chords)
  const chordCursors = listChordCursors(digitizerDoc)
  const selectedCursor = chordCursors.find((c) => c.chordIndex === selectedChordIndex) ?? null
  const composeBrief = { genre: composeGenre, key: composeKey, idea: composeIdea }

  function onGenerateDigitizer() {
    const generated = digitizeToChordPro(digitizerLyrics, digitizerChords)
    setChords(generated)
    setSelectedChordIndex(0)
  }

  function onNudgeSelected(direction: -1 | 1) {
    if (selectedCursor == null) return
    const next = nudgeChord(digitizerDoc, selectedChordIndex, direction)
    setChords(serializeDigitizerDocument(next))
  }

  function onComposeGenerate() {
    setChords(composeChordPro(composeBrief))
  }

  function onComposeVary() {
    setChords(varyProgression(chords, composeBrief))
  }

  function onComposeRewriteVerse() {
    setChords(rewriteVerse(chords, composeBrief))
  }

  function onImportChordPro(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImportError(false)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setImportError(true)
        return
      }
      setChords(reader.result)
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
    const clippedMarks = timingMarks.filter((m) => m.lineIndex < lineCount)

    const payload: Parameters<typeof updateArrangement>[2] = {
      expectedVersion: arrangement.version,
      label: label.trim(),
      defaultKey,
      lyrics,
      chords,
      structure,
      notes,
      chordTimingJson: serializeChordTimingJson(clippedMarks),
    }

    if (defaultBpm.trim()) {
      const parsed = Number(defaultBpm)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 400) {
        setError('El tempo (BPM) debe ser un entero entre 1 y 400.')
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
        setError(mutationErrorMessage(err))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <h3 className="font-semibold">{t('arreglo.editArrangement')}</h3>
      <ProblemAlert message={error} />
      <Field label={t('arreglo.labelLabel')}>
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label={t('arreglo.keyOptional')} hint={t('arreglo.clearKeyHint')}>
        <input
          className={fieldClass}
          value={defaultKey}
          onChange={(e) => setDefaultKey(e.target.value)}
          maxLength={32}
        />
      </Field>
      <Field
        label={t('arreglo.bpmLabel')}
        hint={t('arreglo.keepTempoHint')}
      >
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
      <Field label={t('arreglo.lyricsOptional')}>
        <textarea className={fieldClass} rows={3} value={lyrics} onChange={(e) => setLyrics(e.target.value)} />
      </Field>
      <div className="space-y-1.5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('arreglo.chordsLabel')}</span>
          <textarea
            className={fieldClass}
            rows={5}
            value={chords}
            onChange={(e) => setChords(e.target.value)}
            data-testid="arrangement-chords"
            spellCheck={false}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">
            {t('arreglo.importLabel')}
          </span>
          <input
            className={fieldClass}
            type="file"
            accept=".cho,.chordpro,.txt,text/plain"
            onChange={onImportChordPro}
            data-testid="arrangement-chords-import"
          />
        </label>
        {importError ? <p className="text-sm text-red-600">{t('arreglo.importError')}</p> : null}

        <div
          className="space-y-3 rounded-xl border border-border-subtle bg-surface-hover p-3"
          data-testid="chordpro-digitizer"
        >
          <p className="text-sm font-semibold text-ink">{t('arreglo.digitizeTitle')}</p>
          <p className="text-xs text-muted">
            {t('arreglo.digitizeHint')}
          </p>
          <Field label={t('arreglo.digitizeLyrics')}>
            <textarea
              className={fieldClass}
              rows={3}
              value={digitizerLyrics}
              onChange={(e) => setDigitizerLyrics(e.target.value)}
              data-testid="digitizer-lyrics"
              spellCheck={false}
            />
          </Field>
          <Field label={t('arreglo.digitizeChords')} hint={t('arreglo.digitizeExample')}>
            <textarea
              className={fieldClass}
              rows={2}
              value={digitizerChords}
              onChange={(e) => setDigitizerChords(e.target.value)}
              data-testid="digitizer-chords"
              spellCheck={false}
            />
          </Field>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onGenerateDigitizer}
            data-testid="digitizer-generate"
          >
            {t('arreglo.generateChordPro')}
          </Button>
          {chordCursors.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 pt-1" data-testid="digitizer-studio">
              <label className="text-sm text-ink">
                {t('arreglo.selectedChord')}{' '}
                <select
                  className={fieldClass}
                  value={selectedChordIndex}
                  onChange={(e) => setSelectedChordIndex(Number(e.target.value))}
                  data-testid="digitizer-chord-select"
                >
                  {chordCursors.map((c) => {
                    const chord =
                      digitizerDoc.lines[c.lineIndex]?.slots[c.slotIndex]?.chord ?? '?'
                    return (
                      <option key={c.chordIndex} value={c.chordIndex}>
                        {c.chordIndex + 1}. [{chord}]
                      </option>
                    )
                  })}
                </select>
              </label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={t('arreglo.nudgeLeft')}
                onClick={() => onNudgeSelected(-1)}
                data-testid="digitizer-nudge-left"
              >
                ←
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={t('arreglo.nudgeRight')}
                onClick={() => onNudgeSelected(1)}
                data-testid="digitizer-nudge-right"
              >
                →
              </Button>
            </div>
          ) : null}
        </div>

        <div
          className="space-y-3 rounded-xl border border-border-subtle bg-surface-hover p-3"
          data-testid="chordpro-compose"
        >
          <p className="text-sm font-semibold text-ink">{t('arreglo.composeTitle')}</p>
          <p className="text-xs text-muted">
            {t('arreglo.composeHint')}
          </p>
          <Field label={t('arreglo.genreLabel')}>
            <input
              className={fieldClass}
              value={composeGenre}
              onChange={(e) => setComposeGenre(e.target.value)}
              data-testid="compose-genre"
              maxLength={64}
            />
          </Field>
          <Field label={t('arreglo.keyFieldLabel')}>
            <input
              className={fieldClass}
              value={composeKey}
              onChange={(e) => setComposeKey(e.target.value)}
              data-testid="compose-key"
              maxLength={16}
            />
          </Field>
          <Field label={t('arreglo.ideaLabel')}>
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
              {t('arreglo.generateSong')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onComposeVary}
              data-testid="compose-vary-progression"
              disabled={!chords.includes('{start_of_')}
            >
              {t('arreglo.varyProgression')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onComposeRewriteVerse}
              data-testid="compose-rewrite-verse"
              disabled={!chords.includes('{start_of_verse}')}
            >
              {t('arreglo.rewriteVerse')}
            </Button>
          </div>
        </div>

        <ChordTimingEditor chords={chords} marks={timingMarks} onChange={setTimingMarks} maxMs={maxMs} />

        {chords.trim() ? (
          <div className="space-y-2 pt-1">
            <p className="text-sm font-medium text-ink">{t('arreglo.previewLabel')}</p>
            {looksLikeChordPro(chords) ? (
              <ChordProView
                text={chords}
                testId="chords-preview"
                className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-surface p-3 font-sans ring-1 ring-border-subtle"
              />
            ) : (
              <pre
                className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface p-3 font-sans text-sm ring-1 ring-border-subtle"
                data-testid="chords-preview"
              >
                {chords}
              </pre>
            )}
          </div>
        ) : null}
      </div>
      <Field label={t('arreglo.structureOptional')}>
        <textarea
          className={fieldClass}
          rows={2}
          value={structure}
          onChange={(e) => setStructure(e.target.value)}
        />
      </Field>
      <Field label={t('arreglo.notesOptional')}>
        <textarea className={fieldClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? t('arreglo.saving') : t('arreglo.save')}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          {t('arreglo.cancel')}
        </Button>
      </FormActions>
    </form>
  )
}

function ResourceCreateForm({
  groupId,
  arrangementId,
  onCreated,
  onCancel,
}: {
  groupId: string
  arrangementId: string
  onCreated: () => Promise<void>
  onCancel: () => void
}) {
  const [purpose, setPurpose] = useState<ResourcePurpose>('practice')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [part, setPart] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { t } = useT()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
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
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-4 border-t border-border-subtle pt-4" onSubmit={onSubmit} noValidate>
      <h3 className="font-semibold">{t('arreglo.addLink')}</h3>
      <ProblemAlert message={error} />
      <Field label={t('arreglo.purposeLabel')}>
        <select
          className={fieldClass}
          required
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as ResourcePurpose)}
        >
          {RESOURCE_PURPOSE_ORDER.map((value) => (
            <option key={value} value={value}>
              {formatPurpose(value)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('arreglo.labelLabel')}>
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label={t('arreglo.urlLabel')}>
        <input
          className={fieldClass}
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
        />
      </Field>
      <Field label={t('arreglo.partOptional')}>
        <input className={fieldClass} value={part} onChange={(e) => setPart(e.target.value)} maxLength={100} />
      </Field>
      <Field label={t('arreglo.noteOptional')}>
        <textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? t('arreglo.creating') : t('arreglo.createLink')}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          {t('arreglo.cancel')}
        </Button>
      </FormActions>
    </form>
  )
}

function FileResourceCreateForm({
  groupId,
  arrangementId,
  onCreated,
  onCancel,
}: {
  groupId: string
  arrangementId: string
  onCreated: () => Promise<void>
  onCancel: () => void
}) {
  const [purpose, setPurpose] = useState<ResourcePurpose>('practice')
  const [label, setLabel] = useState('')
  const [part, setPart] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { t } = useT()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!file) {
      setError('Selecciona un archivo.')
      return
    }
    const clientError = validateFileForUpload(file)
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
      setError(fileUploadErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="space-y-4 border-t border-border-subtle pt-4"
      onSubmit={onSubmit}
      noValidate
      aria-busy={pending}
    >
      <h3 className="font-semibold">{t('arreglo.uploadFile')}</h3>
      <ProblemAlert message={error} />
      {pending ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-ink"
          data-testid="file-upload-pending"
        >
          {t('arreglo.uploadPending')}
        </p>
      ) : null}
      <Field label={t('arreglo.purposeLabel')}>
        <select
          className={fieldClass}
          required
          value={purpose}
          disabled={pending}
          onChange={(e) => setPurpose(e.target.value as ResourcePurpose)}
        >
          {RESOURCE_PURPOSE_ORDER.map((value) => (
            <option key={value} value={value}>
              {formatPurpose(value)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('arreglo.labelLabel')}>
        <input
          className={fieldClass}
          required
          value={label}
          disabled={pending}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field
        label={t('arreglo.fileLabel')}
        hint={t('arreglo.fileHint')}
      >
        <input
          className={fieldClass}
          type="file"
          required
          disabled={pending}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.txt,application/pdf,image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/mp4,text/plain"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setError(null)
          }}
        />
      </Field>
      <Field label={t('arreglo.partOptional')}>
        <input
          className={fieldClass}
          value={part}
          disabled={pending}
          onChange={(e) => setPart(e.target.value)}
          maxLength={100}
        />
      </Field>
      <Field label={t('arreglo.noteOptional')}>
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
          {pending ? t('arreglo.uploading') : t('arreglo.uploadFile')}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          {t('arreglo.cancel')}
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
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <h4 className="font-semibold">{t('arreglo.editResourceTitle')}</h4>
      {resource.url ? (
        <p className="text-sm text-muted">
          {t('arreglo.urlLockedPrefix')}{' '}
          <a
            className="break-all font-medium text-primary-ink no-underline hover:underline"
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {resource.url}
          </a>
        </p>
      ) : null}
      {resource.kind === 'file' && resource.originalFileName ? (
        <p className="text-sm text-muted">
          {t('arreglo.fileLockedPrefix')} {resource.originalFileName}
        </p>
      ) : null}
      <ProblemAlert message={error} />
      <Field label={t('arreglo.purposeLabel')}>
        <select
          className={fieldClass}
          required
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as ResourcePurpose)}
        >
          {RESOURCE_PURPOSE_ORDER.map((value) => (
            <option key={value} value={value}>
              {formatPurpose(value)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('arreglo.labelLabel')}>
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label={t('arreglo.partOptional')} hint={t('arreglo.clearPartHint')}>
        <input className={fieldClass} value={part} onChange={(e) => setPart(e.target.value)} maxLength={100} />
      </Field>
      <Field label={t('arreglo.noteOptional')} hint={t('arreglo.clearNoteHint')}>
        <textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? t('arreglo.saving') : t('arreglo.saveShort')}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          {t('arreglo.cancel')}
        </Button>
      </FormActions>
    </form>
  )
}
