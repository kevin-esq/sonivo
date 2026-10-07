import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, FileAudio, Music2, Pause, Play, Plus, SkipForward, Trash2, Upload, X } from 'lucide-react'
import {
  createArrangement,
  createFileResource,
  createSong,
  type SongDetail,
  type SongOriginKind,
} from '../../api/client'
import { useT } from '../../i18n'
import { mutationErrorMessage } from '../../repertoire/ui'
import { notifyGroupDataChanged } from '../../shell/groupEvents'
import { cn } from '../../ui/cn'
import { GroupButton, GroupDialog, GroupInput, GroupSelect, GroupTextArea } from '../ui'

export type CreateSongDialogProps = {
  groupId: string
  onClose: () => void
  onCreated: (song: SongDetail) => void
}

type Step = 'details' | 'audio' | 'arrange' | 'review' | 'done'

/** Audio upload cap; mirrors the server-side file resource limit. */
const MAX_AUDIO_BYTES = 100 * 1024 * 1024
const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.flac,.m4a,.ogg,.aac'
const SECTION_PRESETS = ['Intro', 'Verso', 'Coro', 'Puente', 'Solo', 'Final'] as const

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function formatDuration(ms: number | null): string {
  if (!ms || Number.isNaN(ms)) return '--:--'
  const total = Math.round(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Deterministic decorative waveform (no real audio analysis; layout-only). */
function waveformBars(seed: number, count: number): number[] {
  const bars: number[] = []
  let value = seed % 997
  for (let i = 0; i < count; i += 1) {
    value = (value * 1103515245 + 12345) % 2147483648
    const normalized = (value % 1000) / 1000
    bars.push(18 + Math.round(normalized * 82))
  }
  return bars
}

/**
 * Create-song wizard (ADR-0074 §5, redesigned): Details → optional audio
 * upload → optional arrangement/sections → review → success. Uses only the
 * existing song/arrangement/resource APIs so nothing is faked; the audio lands
 * as a real `audio` file resource on the created arrangement.
 */
export function CreateSongWizard({ groupId, onClose, onCreated }: CreateSongDialogProps) {
  const { t } = useT()
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('details')

  const [title, setTitle] = useState('')
  const [originKind, setOriginKind] = useState<SongOriginKind>('original')
  const [attribution, setAttribution] = useState('')
  const [genre, setGenre] = useState('')
  const [tags, setTags] = useState('')
  const [description, setDescription] = useState('')

  const [file, setFile] = useState<File | null>(null)
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const [arrangementLabel, setArrangementLabel] = useState('')
  const [defaultKey, setDefaultKey] = useState('')
  const [defaultBpm, setDefaultBpm] = useState('')
  const [sections, setSections] = useState<string[]>([])

  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<SongDetail | null>(null)

  // Real audio preview: encoded object URL, decoded peaks for the waveform, and
  // playback position so the preview is truthful rather than decorative.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [playing, setPlaying] = useState(false)
  const [positionMs, setPositionMs] = useState(0)

  const originOptions = [
    { value: 'original', label: t('songCreate.originOriginal') },
    { value: 'cover', label: t('songCreate.originCover') },
    { value: 'other', label: t('songCreate.originOther') },
  ]

  const steps = useMemo<Step[]>(
    () => (file ? ['details', 'audio', 'arrange', 'review'] : ['details', 'audio', 'review']),
    [file],
  )
  const stepLabels: Record<string, string> = {
    details: t('songCreate.wizardStepDetails'),
    audio: t('songCreate.wizardStepAudio'),
    arrange: t('songCreate.wizardStepArrange'),
    review: t('songCreate.wizardStepReview'),
  }

  // Read duration from the selected file without uploading it.
  useEffect(() => {
    if (!file) {
      setDurationMs(null)
      return
    }
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.preload = 'metadata'
    const onLoaded = () => setDurationMs(Number.isFinite(audio.duration) ? audio.duration * 1000 : null)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.src = url
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      URL.revokeObjectURL(url)
    }
  }, [file])

  // Object URL for the inline preview player (revoked when the file changes).
  useEffect(() => {
    if (!file) {
      setPreviewSrc(null)
      setPlaying(false)
      setPositionMs(0)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Decode the audio and downsample it into waveform peaks (falls back to the
  // decorative pattern when the browser cannot decode the codec).
  useEffect(() => {
    let cancelled = false
    if (!file) {
      setPeaks(null)
      return
    }
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) {
      setPeaks(null)
      return
    }
    const context = new AudioCtor()
    file
      .arrayBuffer()
      .then((buffer) => context.decodeAudioData(buffer))
      .then((decoded) => {
        const channel = decoded.getChannelData(0)
        const count = 72
        const block = Math.max(1, Math.floor(channel.length / count))
        const next: number[] = []
        for (let i = 0; i < count; i += 1) {
          let peak = 0
          const start = i * block
          for (let j = 0; j < block; j += 1) {
            const value = Math.abs(channel[start + j] ?? 0)
            if (value > peak) peak = value
          }
          next.push(Math.max(6, Math.round(peak * 100)))
        }
        if (!cancelled) setPeaks(next)
      })
      .catch(() => {
        if (!cancelled) setPeaks(null)
      })
      .finally(() => {
        void context.close().catch(() => undefined)
      })
    return () => {
      cancelled = true
    }
  }, [file])

  function togglePreview() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play().catch(() => undefined)
    else audio.pause()
  }

  const bars = useMemo(() => waveformBars(title.length + sections.length + 7, 72), [title.length, sections.length])
  const wave = peaks ?? bars

  function pickFile(next: File | null) {
    setFileError(null)
    if (!next) return
    if (!next.type.startsWith('audio/') && !/\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(next.name)) {
      setFileError(t('songCreate.wizardFileTypeError'))
      return
    }
    if (next.size > MAX_AUDIO_BYTES) {
      setFileError(t('songCreate.wizardFileTooLarge'))
      return
    }
    setFile(next)
    if (!arrangementLabel) setArrangementLabel(next.name.replace(/\.[^.]+$/, ''))
  }

  function next() {
    setError(null)
    if (step === 'details') {
      if (!title.trim()) return
      setStep('audio')
      return
    }
    if (step === 'audio') {
      setStep(file ? 'arrange' : 'review')
      return
    }
    if (step === 'arrange') {
      setStep('review')
      return
    }
  }

  function back() {
    setError(null)
    if (step === 'review') setStep(file ? 'arrange' : 'audio')
    else if (step === 'arrange') setStep('audio')
    else if (step === 'audio') setStep('details')
  }

  function addSection(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    setSections((list) => [...list, trimmed])
  }

  function moveSection(index: number, delta: number) {
    setSections((list) => {
      const target = index + delta
      if (target < 0 || target >= list.length) return list
      const copy = [...list]
      const [item] = copy.splice(index, 1)
      copy.splice(target, 0, item!)
      return copy
    })
  }

  async function submit() {
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    try {
      const song = await createSong(groupId, {
        title: title.trim(),
        originKind,
        attribution: attribution.trim() || null,
        rightsNotes: description.trim() || null,
        tags: [genre, tags]
          .join(',')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      })

      if (file) {
        setUploading(true)
        const arrangement = await createArrangement(groupId, song.id, {
          label: arrangementLabel.trim() || t('songCreate.wizardDefaultArrangement'),
          defaultKey: defaultKey.trim() || null,
          defaultBpm: defaultBpm.trim() ? Number(defaultBpm) : null,
          structure: sections.length ? sections.join('\n') : null,
        })
        await createFileResource(groupId, arrangement.id, {
          purpose: 'audio',
          label: file.name,
          file,
        })
        setUploading(false)
      }

      notifyGroupDataChanged('songs', groupId)
      setCreated(song)
      setStep('done')
    } catch (err) {
      setUploading(false)
      setError(mutationErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function finish() {
    if (created) onCreated(created)
    onClose()
  }

  function createAnother() {
    // Keep the shell open; the caller refreshes the library when the dialog finally closes.
    setCreated(null)
    setStep('details')
    setTitle('')
    setOriginKind('original')
    setAttribution('')
    setGenre('')
    setTags('')
    setDescription('')
    setFile(null)
    setDurationMs(null)
    setArrangementLabel('')
    setDefaultKey('')
    setDefaultBpm('')
    setSections([])
    setError(null)
  }

  const activeIndex = steps.indexOf(step === 'done' ? 'review' : step)
  const pendingLabel = uploading ? t('songCreate.wizardUploadingAudio') : t('songCreate.creating')

  const footer =
    step === 'done' ? (
      <>
        <GroupButton variant="secondary" type="button" onClick={createAnother}>
          {t('songCreate.wizardCreateAnother')}
        </GroupButton>
        <GroupButton type="button" onClick={finish}>
          {t('songCreate.wizardViewLibrary')}
        </GroupButton>
      </>
    ) : (
      <>
        {step === 'details' ? (
          <GroupButton variant="ghost" type="button" onClick={onClose} disabled={busy}>
            {t('songCreate.cancel')}
          </GroupButton>
        ) : (
          <GroupButton variant="secondary" type="button" onClick={back} disabled={busy}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {t('songCreate.wizardBack')}
          </GroupButton>
        )}
        <span className="flex-1" />
        {step === 'review' ? (
          <GroupButton type="button" onClick={() => void submit()} disabled={busy || !title.trim()}>
            {busy ? pendingLabel : t('songCreate.create')}
          </GroupButton>
        ) : (
          <GroupButton
            type="button"
            onClick={next}
            disabled={busy || (step === 'details' && !title.trim())}
          >
            {step === 'audio' && !file ? t('songCreate.wizardSkipAudio') : t('songCreate.wizardContinue')}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </GroupButton>
        )}
      </>
    )

  return (
    <GroupDialog
      open
      onClose={busy ? () => undefined : finish}
      title={t('songCreate.createTitle')}
      size="lg"
      pending={busy}
      testId="create-song-dialog"
      footer={footer}
    >
      {step !== 'done' ? (
        <ol className="flex flex-wrap items-center gap-2 text-xs font-medium" aria-label={t('songCreate.createTitle')}>
          {steps.map((id, index) => (
            <li key={id} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-1',
                  index === activeIndex
                    ? 'bg-primary-strong text-primary-foreground'
                    : index < activeIndex
                      ? 'bg-primary/15 text-primary-ink'
                      : 'bg-surface-hover text-muted',
                )}
                aria-current={index === activeIndex ? 'step' : undefined}
              >
                <span className="grid h-4 w-4 place-items-center rounded-full bg-black/15 text-[10px]">
                  {index < activeIndex ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
                </span>
                {stepLabels[id]}
              </span>
              {index < steps.length - 1 ? <ChevronRight className="h-3.5 w-3.5 text-muted" aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm text-error-ink">
          {error}
        </p>
      ) : null}

      {/* Step: details */}
      {step === 'details' ? (
        <div className="space-y-4">
          <GroupInput
            label={t('songCreate.titleLabel')}
            value={title}
            maxLength={200}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
            data-autofocus
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <GroupSelect
              label={t('songCreate.originLabel')}
              value={originKind}
              options={originOptions}
              disabled={busy}
              onChange={(value) => setOriginKind(value as SongOriginKind)}
            />
            <GroupInput
              label={t('songCreate.wizardArtist')}
              value={attribution}
              maxLength={500}
              disabled={busy}
              onChange={(event) => setAttribution(event.target.value)}
            />
            <GroupInput
              label={t('songCreate.wizardGenre')}
              value={genre}
              maxLength={80}
              disabled={busy}
              onChange={(event) => setGenre(event.target.value)}
            />
            <GroupInput
              label={t('songCreate.tagsLabel')}
              hint={t('songCreate.tagsPlaceholder')}
              value={tags}
              maxLength={200}
              disabled={busy}
              onChange={(event) => setTags(event.target.value)}
            />
          </div>
          <GroupTextArea
            label={t('songCreate.wizardDescription')}
            hint={t('songCreate.wizardDescriptionPlaceholder')}
            rows={3}
            value={description}
            maxLength={2000}
            disabled={busy}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      ) : null}

      {/* Step: audio */}
      {step === 'audio' ? (
        <div className="space-y-4">
          <div>
            <h3 className="flex items-center gap-2 font-medium text-ink">
              <Music2 className="h-4 w-4 text-primary-ink" aria-hidden="true" />
              {t('songCreate.wizardAudioTitle')}
            </h3>
            <p className="mt-1 text-sm text-muted">{t('songCreate.wizardAudioHint')}</p>
          </div>

          {!file ? (
            <div
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                pickFile(event.dataTransfer.files?.[0] ?? null)
              }}
              className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors',
                dragging ? 'border-primary bg-primary/5' : 'border-border-subtle bg-surface',
              )}
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary-ink">
                <Upload className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-ink">{t('songCreate.wizardDropHere')}</p>
              <p className="text-xs text-muted">{t('songCreate.wizardAudioFormats')}</p>
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                accept={AUDIO_ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  pickFile(event.target.files?.[0] ?? null)
                  event.target.value = ''
                }}
              />
              <GroupButton variant="secondary" type="button" onClick={() => fileInputRef.current?.click()}>
                {t('songCreate.wizardChooseFile')}
              </GroupButton>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-4 py-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-ink">
                <FileAudio className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{file.name}</span>
                <span className="block text-xs text-muted">
                  {formatBytes(file.size)} · {formatDuration(durationMs)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label={t('songCreate.wizardRemoveFile')}
                className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {fileError ? (
            <p role="alert" className="text-sm text-error-ink">
              {fileError}
            </p>
          ) : null}
          <p className="flex items-center gap-2 text-xs text-muted">
            <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
            {t('songCreate.wizardAudioOptional')}
          </p>
        </div>
      ) : null}

      {/* Step: arrange */}
      {step === 'arrange' && file ? (
        <div className="space-y-4">
          <div>
            <h3 className="font-medium text-ink">{t('songCreate.wizardArrangeTitle')}</h3>
            <p className="mt-1 text-sm text-muted">{t('songCreate.wizardArrangeHint')}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <GroupInput
              label={t('songCreate.wizardArrangementLabel')}
              value={arrangementLabel}
              maxLength={120}
              disabled={busy}
              onChange={(event) => setArrangementLabel(event.target.value)}
            />
            <GroupInput
              label={t('songCreate.wizardKey')}
              value={defaultKey}
              maxLength={12}
              disabled={busy}
              onChange={(event) => setDefaultKey(event.target.value)}
            />
            <GroupInput
              label={t('songCreate.wizardBpm')}
              type="number"
              value={defaultBpm}
              disabled={busy}
              onChange={(event) => setDefaultBpm(event.target.value)}
            />
          </div>

          {/* Real audio preview: decoded waveform + inline player + section lanes. */}
          <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePreview}
                aria-label={playing ? t('songCreate.wizardPausePreview') : t('songCreate.wizardPlayPreview')}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-strong text-primary-foreground shadow-sm transition hover:bg-primary-strong/90"
              >
                {playing ? (
                  <Pause className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Play className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
              <div className="flex h-16 min-w-0 flex-1 items-center gap-[2px] overflow-hidden rounded-lg bg-surface-hover/60 px-1">
                {wave.map((height, index, all) => {
                  const total = durationMs ?? 0
                  const passed = total > 0 ? (index / all.length) * total <= positionMs : false
                  return (
                    <span
                      key={index}
                      aria-hidden="true"
                      className={cn('w-[2px] shrink-0 rounded-full', passed ? 'bg-primary' : 'bg-primary/35')}
                      style={{ height: `${height}%` }}
                    />
                  )
                })}
              </div>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted">
                {formatDuration(positionMs)} / {formatDuration(durationMs)}
              </span>
            </div>
            <audio
              ref={audioRef}
              src={previewSrc ?? undefined}
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false)
                setPositionMs(0)
              }}
              onTimeUpdate={(event) => setPositionMs(event.currentTarget.currentTime * 1000)}
              className="sr-only"
            />
            <p className="text-xs text-muted">{t('songCreate.wizardPreviewHint')}</p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink">{t('songCreate.wizardSectionsTitle')}</span>
              <div className="flex flex-wrap gap-1.5">
                {SECTION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => addSection(preset)}
                    className="rounded-lg border border-border-subtle px-2.5 py-1 text-xs font-medium text-muted hover:border-primary/30 hover:text-ink"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            {sections.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-subtle px-3 py-4 text-center text-sm text-muted">
                {t('songCreate.wizardSectionsEmpty')}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {sections.map((section, index) => (
                  <li
                    key={`${section}-${index}`}
                    className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-xs font-semibold text-primary-ink">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{section}</span>
                    <button
                      type="button"
                      onClick={() => moveSection(index, -1)}
                      disabled={index === 0}
                      aria-label={t('songCreate.wizardMoveUp')}
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4 rotate-90" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(index, 1)}
                      disabled={index === sections.length - 1}
                      aria-label={t('songCreate.wizardMoveDown')}
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4 rotate-90" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSections((list) => list.filter((_, i) => i !== index))}
                      aria-label={t('songCreate.wizardRemove')}
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-error-ink"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <SectionComposer onAdd={addSection} placeholder={t('songCreate.wizardSectionCustomPlaceholder')} addLabel={t('songCreate.wizardSectionAdd')} />
          </div>
        </div>
      ) : null}

      {/* Step: review */}
      {step === 'review' ? (
        <div className="space-y-4">
          <h3 className="font-medium text-ink">{t('songCreate.wizardReviewTitle')}</h3>
          <dl className="space-y-2 rounded-2xl border border-border-subtle bg-surface p-4 text-sm">
            <ReviewRow label={t('songCreate.titleLabel')} value={title.trim()} />
            <ReviewRow label={t('songCreate.originLabel')} value={originOptions.find((o) => o.value === originKind)?.label ?? ''} />
            {attribution.trim() ? <ReviewRow label={t('songCreate.wizardArtist')} value={attribution.trim()} /> : null}
            <ReviewRow
              label={t('songCreate.wizardReviewAudio')}
              value={file ? `${file.name} · ${formatDuration(durationMs)}` : t('songCreate.wizardReviewNoAudio')}
            />
            {file && sections.length ? (
              <ReviewRow label={t('songCreate.wizardSectionsTitle')} value={sections.join(' · ')} />
            ) : null}
          </dl>

          {busy ? (
            <div className="space-y-2" role="status" aria-live="polite">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
              </div>
              <p className="text-xs text-muted">{pendingLabel}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Step: done */}
      {step === 'done' ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/15 text-primary-ink">
            <Check className="h-8 w-8" aria-hidden="true" />
          </span>
          <h3 className="font-display text-xl font-bold text-ink">{t('songCreate.wizardDoneTitle')}</h3>
          <p className="max-w-sm text-sm text-muted">{t('songCreate.wizardDoneBody')}</p>
          {created ? (
            <div className="mt-2 flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-4 py-3 text-left">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary-ink">
                <Music2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{created.title}</span>
                <span className="block text-xs text-muted">
                  {attribution.trim() || t('songCreate.wizardDefaultArtist')}
                  {file ? ` · ${formatDuration(durationMs)}` : ''}
                </span>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </GroupDialog>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-right font-medium text-ink">{value}</dd>
    </div>
  )
}

function SectionComposer({
  onAdd,
  placeholder,
  addLabel,
}: {
  onAdd: (name: string) => void
  placeholder: string
  addLabel: string
}) {
  const [value, setValue] = useState('')
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <GroupInput
          label={addLabel}
          value={value}
          maxLength={60}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onAdd(value)
              setValue('')
            }
          }}
        />
      </div>
      <GroupButton
        variant="secondary"
        type="button"
        onClick={() => {
          onAdd(value)
          setValue('')
        }}
        disabled={!value.trim()}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {addLabel}
      </GroupButton>
    </div>
  )
}
