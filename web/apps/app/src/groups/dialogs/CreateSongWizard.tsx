import { routes } from '../../routing/routes'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ClipboardCheck, Music2, Pencil, Trash2 } from 'lucide-react'
import {
  createArrangement,
  createFileResource,
  createSong,
  getGroup,
  uploadSongCoverImage,
  type SongDetail,
  type SongOriginKind,
} from '../../api/client'
import { useT } from '../../i18n'
import { mutationErrorMessage } from '../../repertoire/ui'
import { notifyGroupDataChanged } from '../../shell/groupEvents'
import { cn } from '../../ui/cn'
import { FileDropzone } from '../../ui/FileDropzone'
import { resourceUploadLimit } from '../../repertoire/fileUploadErrors'
import { SongAudioPreview } from './SongAudioPreview'
import { SongTagPicker } from '../../repertoire/SongTagPicker'
import { SongWizardAddButton } from './SongWizardAddButton'
import { GroupButton, GroupDialog, GroupInput, GroupLink, GroupSelect, GroupTextArea } from '../ui'

export type CreateSongDialogProps = {
  groupId: string
  onClose: () => void
  onCreated: (song: SongDetail) => void
}

type Step = 'details' | 'audio' | 'arrange' | 'review' | 'done'
type VersionAudio = { id: string; file: File | null }
type ExtraVersion = { id: string; label: string; key: string; bpm: string; lyrics: string; chords: string; structure: string; audioFiles: VersionAudio[] }

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.flac,.m4a,.ogg,.aac'
const TRACK_EXAMPLE_KEYS = [
  'songCreate.wizardTrackNoLyrics',
  'songCreate.wizardTrackWithLyrics',
  'songCreate.wizardTrackInstrumental',
  'songCreate.wizardTrackBaritone',
] as const
const VERSION_EXAMPLE_KEYS = [
  'songCreate.wizardVersionSpanish',
  'songCreate.wizardVersionEnglish',
  'songCreate.wizardVersionPortuguese',
  'songCreate.wizardVersionRock',
] as const

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

/**
 * Create-song wizard (ADR-0074 §5, redesigned): Details → optional audio
 * upload → optional arrangement/sections → review → success. Uses only the
 * existing song/arrangement/resource APIs so nothing is faked; the audio lands
 * as a real `audio` file resource on the created arrangement.
 */
export function CreateSongWizard({ groupId, onClose, onCreated }: CreateSongDialogProps) {
  const { t } = useT()
  const [step, setStep] = useState<Step>('details')

  const [title, setTitle] = useState('')
  const [originKind, setOriginKind] = useState<SongOriginKind>('original')
  const [attribution, setAttribution] = useState('')
  const [genre, setGenre] = useState('')
  const [album, setAlbum] = useState('')
  const [releaseYear, setReleaseYear] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [description, setDescription] = useState('')

  const [file, setFile] = useState<File | null>(null)
  const [firstAudioLabel, setFirstAudioLabel] = useState('')
  const [extraTracks, setExtraTracks] = useState<Array<{ id: string; label: string; file: File | null }>>([])
  const [planId, setPlanId] = useState<string>('starter')
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const [defaultKey, setDefaultKey] = useState('')
  const [defaultBpm, setDefaultBpm] = useState('')
  const [sections, setSections] = useState<string[]>([])
  const [lyrics, setLyrics] = useState('')
  const [initialVersionLabel, setInitialVersionLabel] = useState('')
  const [chords, setChords] = useState('')
  const [showMoreSongDetails, setShowMoreSongDetails] = useState(false)
  const [expandedVersionDetails, setExpandedVersionDetails] = useState<Record<string, boolean>>({})
  const [expandedVersionAudio, setExpandedVersionAudio] = useState<Record<string, boolean>>({})
  const [reviewReturnStep, setReviewReturnStep] = useState<Step>('review')
  const detailsEditedFromReview = useRef(false)
  const [extraVersions, setExtraVersions] = useState<ExtraVersion[]>([])
  const savedSong = useRef<SongDetail | null>(null)
  const savedArrangements = useRef(new Map<string, { id: string }>())
  const uploadedAudio = useRef(new Set<string>())
  const uploadedCover = useRef(false)

  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<SongDetail | null>(null)

  const addTrackButtonRef = useRef<HTMLDivElement | null>(null)
  const addVersionButtonRef = useRef<HTMLDivElement | null>(null)
  const scrollToTracksAfterAdd = useRef(false)
  const scrollToVersionsAfterAdd = useRef(false)
  const maxAudioBytes = resourceUploadLimit(planId, 'audio')
  const willCreateInitialArrangement = Boolean(extraTracks.some((track) => track.file) || extraVersions.length || file || lyrics.trim() || defaultKey.trim() || defaultBpm.trim() || sections.length)
  const willCreateArrangement = willCreateInitialArrangement || extraVersions.length > 0

  useEffect(() => {
    let cancelled = false
    getGroup(groupId)
      .then((group) => {
        if (!cancelled) setPlanId(group.planId)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [groupId])

  const originOptions = [
    { value: 'original', label: t('songCreate.originOriginal') },
    { value: 'cover', label: t('songCreate.originCover') },
    { value: 'other', label: t('songCreate.originOther') },
  ]

  const steps = useMemo<Step[]>(
    () => ['details', 'audio', 'arrange', 'review'],
    [],
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

  function pickFile(next: File | null) {
    setFileError(null)
    if (!next) {
      setFile(null)
      return
    }
    if (!next.type.startsWith('audio/') && !/\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(next.name)) {
      setFileError(t('songCreate.wizardFileTypeError'))
      return
    }
    if (next.size > maxAudioBytes) {
      setFileError(t('songCreate.wizardFileTooLarge'))
      return
    }
    setFile(next)
  }

  function next() {
    setError(null)
    if (step === 'details') {
      if (!title.trim()) return
      const returnToReview = detailsEditedFromReview.current
      detailsEditedFromReview.current = false
      setStep(returnToReview ? 'review' : 'audio')
      return
    }
    if (step === 'audio') {
      setStep(reviewReturnStep === 'audio' ? 'review' : 'arrange')
      return
    }
    if (step === 'arrange') {
      setStep('review')
      return
    }
  }

  function back() {
    setError(null)
    if (step === 'review') setStep('arrange')
    else if (step === 'arrange') setStep('audio')
    else if (step === 'audio') setStep('details')
  }

  function addVersion() {
    setExtraVersions((current) => [...current, { id: crypto.randomUUID(), label: '', key: '', bpm: '', lyrics: '', chords: '', structure: '', audioFiles: [] }])
    scrollToVersionsAfterAdd.current = true
  }

  function addTrack() {
    setExtraTracks((current) => [...current, { id: crypto.randomUUID(), label: '', file: null }])
    scrollToTracksAfterAdd.current = true
  }

  useEffect(() => {
    if (!scrollToTracksAfterAdd.current) return
    scrollToTracksAfterAdd.current = false
    requestAnimationFrame(() => {
      const scrollArea = addTrackButtonRef.current?.closest<HTMLElement>('[data-testid="create-song-dialog"] .overflow-y-auto')
      scrollArea?.scrollTo({ top: scrollArea.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    })
  }, [extraTracks.length])

  useEffect(() => {
    if (!scrollToVersionsAfterAdd.current) return
    scrollToVersionsAfterAdd.current = false
    requestAnimationFrame(() => addVersionButtonRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }))
  }, [extraVersions.length])

  function updateVersion(id: string, patch: Partial<ExtraVersion>) {
    setExtraVersions((current) => current.map((version) => version.id === id ? { ...version, ...patch } : version))
  }

  function toggleVersionDetails(id: string) {
    setExpandedVersionDetails((current) => ({ ...current, [id]: !current[id] }))
  }

  function addVersionAudio(id: string) {
    const audio = { id: crypto.randomUUID(), file: null }
    setExtraVersions((current) => current.map((version) => version.id === id ? { ...version, audioFiles: [...version.audioFiles, audio] } : version))
    setExpandedVersionAudio((current) => ({ ...current, [id]: true }))
  }

  function removeVersionAudio(id: string, audioId: string) {
    setExtraVersions((current) => current.map((version) => version.id === id ? { ...version, audioFiles: version.audioFiles.filter((audio) => audio.id !== audioId) } : version))
  }

  function pickVersionFile(id: string, audioId: string, next: File | null) {
    if (next && !next.type.startsWith('audio/') && !/\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(next.name)) {
      setError(t('songCreate.wizardFileTypeError'))
      return
    }
    if (next && next.size > maxAudioBytes) {
      setError(t('songCreate.wizardFileTooLarge'))
      return
    }
    setError(null)
    setExtraVersions((current) => current.map((version) => version.id === id ? { ...version, audioFiles: version.audioFiles.map((audio) => audio.id === audioId ? { ...audio, file: next } : audio) } : version))
  }

  async function submit() {
    if (!title.trim()) return
    const parsedYear = releaseYear.trim() ? Number(releaseYear) : null
    if (parsedYear != null && (!Number.isInteger(parsedYear) || parsedYear < 1000 || parsedYear > 9999)) {
      setError(t('songCreate.releaseYearInvalid'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      let song = savedSong.current ?? await createSong(groupId, {
        title: title.trim(),
        originKind,
        attribution: attribution.trim() || null,
        genre: genre.trim() || null,
        album: album.trim() || null,
        releaseYear: parsedYear,
        rightsNotes: description.trim() || null,
        tags,
      })

      savedSong.current = song
      if (coverFile && !uploadedCover.current) {
        song = await uploadSongCoverImage(groupId, song.id, coverFile, song.version)
        savedSong.current = song
        uploadedCover.current = true
      }
      notifyGroupDataChanged('songs', groupId)
      const drafts = [
        ...(willCreateInitialArrangement ? [{ id: 'initial', label: initialVersionLabel.trim() || t('songCreate.wizardDefaultInitialVersion'), key: defaultKey, bpm: defaultBpm, lyrics, chords, structure: sections.join('\n'), audioFiles: file ? [{ id: 'initial-audio', file }] : [] }] : []),
        ...extraVersions.map((version) => ({ id: version.id, label: version.label.trim() || t('songCreate.wizardDefaultArrangement'), key: version.key, bpm: version.bpm, lyrics: version.lyrics, chords: version.chords, structure: version.structure, audioFiles: version.audioFiles.filter((audio): audio is VersionAudio & { file: File } => audio.file !== null) })),
      ]
      for (const draft of drafts) {
        const arrangement = savedArrangements.current.get(draft.id) ?? await createArrangement(groupId, song.id, {
          label: draft.label,
          defaultKey: draft.key.trim() || null,
          defaultBpm: draft.bpm.trim() ? Number(draft.bpm) : null,
          lyrics: draft.lyrics.trim() || null,
          chords: draft.chords.trim() || null,
          structure: draft.structure.trim() || null,
        })
        savedArrangements.current.set(draft.id, arrangement)
        for (const audio of draft.audioFiles) {
          if (uploadedAudio.current.has(audio.id)) continue
          setUploading(true)
          await createFileResource(groupId, arrangement.id, { purpose: 'audio', label: audio.id === 'initial-audio' ? firstAudioLabel.trim() || audio.file.name : audio.file.name, file: audio.file })
          uploadedAudio.current.add(audio.id)
          setUploading(false)
        }
      }
      if (extraTracks.some((track) => track.file)) {
        const initial = savedArrangements.current.get('initial')
        if (!initial) throw new Error('Audio tracks require an initial arrangement.')
        for (const track of extraTracks) {
          if (track.file && !uploadedAudio.current.has(track.id)) {
            setUploading(true)
            await createFileResource(groupId, initial.id, { purpose: 'audio', label: track.label.trim() || track.file.name, file: track.file })
            uploadedAudio.current.add(track.id)
            setUploading(false)
          }
        }
      }

      notifyGroupDataChanged('songs', groupId)
      setCreated(song)
      setStep('done')
    } catch (err) {
      setUploading(false)
      setError(mutationErrorMessage(err, t))
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
    savedSong.current = null
    savedArrangements.current.clear()
    uploadedAudio.current.clear()
    setLyrics('')
    setChords('')
    setStep('details')
    setTitle('')
    setOriginKind('original')
    setAttribution('')
    setGenre('')
    setTags([])
    setAlbum('')
    setReleaseYear('')
    setCoverFile(null)
    uploadedCover.current = false
    setDescription('')
    setShowMoreSongDetails(false)
    setFile(null)
    setFirstAudioLabel('')
    setDurationMs(null)
    setInitialVersionLabel('')
    setDefaultKey('')
    setDefaultBpm('')
    setSections([])
    setExtraVersions([])
    setExtraTracks([])
    setExpandedVersionDetails({})
    setExpandedVersionAudio({})
    detailsEditedFromReview.current = false
    setError(null)
  }

  const activeIndex = steps.indexOf(step === 'done' ? 'review' : step)
  const pendingLabel = uploading ? t('songCreate.wizardUploadingAudio') : t('songCreate.creating')

  const footer = (requestClose: () => void) =>
    step === 'done' ? (
      <>
        <GroupButton variant="secondary" type="button" onClick={createAnother}>
          {t('songCreate.wizardCreateAnother')}
        </GroupButton>
        {created ? <GroupLink to={routes.groupSong(groupId, created.id)} onClick={finish}>{t('workflow.openSong')}</GroupLink> : null}
      </>
    ) : (
      <>
        {step === 'details' ? (
          <GroupButton variant="ghost" type="button" onClick={requestClose} disabled={busy}>
            {t('songCreate.cancel')}
          </GroupButton>
        ) : (
          <GroupButton variant="secondary" type="button" onClick={back} disabled={busy || savedSong.current !== null}>
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
      size="xl"
      mobileFullscreen
      fitContent
      pending={busy}
      confirmDiscard={step !== 'done' && (title.trim().length > 0 || savedSong.current !== null || step !== 'details')}
      testId="create-song-dialog"
      footer={footer}
    >
      {step !== 'done' ? (
        <ol className="mb-5 grid grid-cols-2 gap-2 text-xs font-medium sm:grid-cols-4" aria-label={t('songCreate.createTitle')}>
          {steps.map((id, index) => (
            <li key={id} className="min-w-0">
              <span
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-xl border px-3 py-1.5',
                  index === activeIndex
                    ? 'border-primary-strong bg-primary-strong text-primary-foreground'
                    : index < activeIndex
                      ? 'border-primary/20 bg-primary/10 text-primary-ink'
                      : 'border-border-subtle bg-surface-hover text-muted',
                )}
                aria-current={index === activeIndex ? 'step' : undefined}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black/15 text-[10px]">
                  {index < activeIndex ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span className="truncate">{stepLabels[id]}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm text-error-ink">
          {error}
        </p>
      ) : null}

      {savedSong.current && error ? <p role="status" className="text-sm text-muted">{t('workflow.partialSave')}</p> : null}
      {/* Step: details */}
      {step === 'details' ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary-ink"><Music2 className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h3 className="font-semibold text-ink">{t('songCreate.wizardDetailsTitle')}</h3>
              <p className="text-sm text-muted">{t('workflow.songSteps')}</p>
            </div>
          </div>
          <div className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5">
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
            </div>
          </div>
          <button
            type="button"
            aria-expanded={showMoreSongDetails}
            onClick={() => setShowMoreSongDetails((current) => !current)}
            className="min-h-11 rounded-lg text-sm font-medium text-primary-ink underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t(showMoreSongDetails ? 'songCreate.wizardHideDetails' : 'songCreate.wizardMoreDetails')}
          </button>
          {showMoreSongDetails ? (
            <div className="space-y-4 rounded-2xl border border-border-subtle bg-surface-hover p-4">
              <GroupInput
                label={t('songCreate.wizardGenre')}
                value={genre}
                maxLength={100}
                disabled={busy}
                onChange={(event) => setGenre(event.target.value)}
              />
              <GroupInput label={t('songCreate.albumLabel')} value={album} maxLength={200} disabled={busy} onChange={(event) => setAlbum(event.target.value)} />
              <GroupInput label={t('songCreate.releaseYearLabel')} value={releaseYear} type="number" min={1000} max={9999} disabled={busy} onChange={(event) => setReleaseYear(event.target.value)} />
              <SongTagPicker groupId={groupId} value={tags} onChange={setTags} disabled={busy} />
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t('songCreate.coverImageLabel')}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => {
                  const picked = event.target.files?.[0] ?? null
                  if (picked && (!['image/jpeg', 'image/png', 'image/webp'].includes(picked.type) || picked.size > 2 * 1024 * 1024)) {
                    setError(t('songCreate.coverImageInvalid'))
                    setCoverFile(null)
                    return
                  }
                  setError(null)
                  setCoverFile(picked)
                }} />
                <span className="block text-xs text-muted">{coverFile?.name ?? t('songCreate.coverImageHint')}</span>
              </label>
              <GroupTextArea
                label={t('workflow.rightsNotes')}
                hint={t('workflow.rightsHint')}
                rows={3}
                value={description}
                maxLength={2000}
                disabled={busy}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Step: audio */}
      {step === 'audio' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary-ink"><Music2 className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h3 className="font-semibold text-ink">{t('songCreate.wizardAudioTitle')}</h3>
              <p className="text-sm text-muted">{t('songCreate.wizardAudioHint')}</p>
            </div>
          </div>

          <section className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5" aria-label={t('songCreate.wizardAudioSlot', { number: 1 })}>
            <GroupInput label={t('songCreate.wizardTrackName')} value={firstAudioLabel} maxLength={120} disabled={busy} onChange={(event) => setFirstAudioLabel(event.target.value)} placeholder={t('songCreate.wizardFirstAudioNameHint')} />
            <FileDropzone
              title={t('songCreate.wizardVersionAudio')}
              description={t('songCreate.wizardAudioFormats')}
              chooseLabel={t('songCreate.wizardChooseFile')}
              removeLabel={t('songCreate.wizardRemoveFile')}
              accept={AUDIO_ACCEPT}
              maxSizeBytes={maxAudioBytes}
              file={file}
              onFileChange={pickFile}
              disabled={busy}
              icon={Music2}
              selectedDetail={file ? `${formatBytes(file.size)} · ${formatDuration(durationMs)}` : undefined}
              testId="song-audio-dropzone"
            />
            {file ? <SongAudioPreview file={file} /> : null}
            {fileError ? <p role="alert" className="text-sm text-error-ink">{fileError}</p> : null}
          </section>
          {extraTracks.map((track, index) => (
            <section key={track.id} className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-ink">{t('songCreate.wizardTrackNumber', { number: index + 2 })}</span><GroupButton type="button" variant="ghost" onClick={() => setExtraTracks((current) => current.filter((item) => item.id !== track.id))}><Trash2 className="h-4 w-4" aria-hidden="true" />{t('songCreate.wizardRemove')}</GroupButton></div>
              <GroupInput label={t('songCreate.wizardTrackName')} value={track.label} maxLength={120} disabled={busy} onChange={(event) => setExtraTracks((current) => current.map((item) => item.id === track.id ? { ...item, label: event.target.value } : item))} placeholder={t('songCreate.wizardTrackNameHint', { number: index + 2 })} />
              <FileDropzone title={t('songCreate.wizardTrackFile')} description={t('songCreate.wizardAudioFormats')} chooseLabel={t('songCreate.wizardChooseFile')} removeLabel={t('songCreate.wizardRemoveFile')} accept={AUDIO_ACCEPT} maxSizeBytes={maxAudioBytes} file={track.file} onFileChange={(next) => { if (next && next.size > maxAudioBytes) { setFileError(t('songCreate.wizardFileTooLarge')); return } setFileError(null); setExtraTracks((current) => current.map((item) => item.id === track.id ? { ...item, file: next } : item)) }} disabled={busy} icon={Music2} testId={`song-extra-track-${index + 1}`} />
              {track.file ? <SongAudioPreview file={track.file} /> : null}
            </section>
          ))}
          <SongWizardAddButton buttonRef={addTrackButtonRef} label={t('songCreate.wizardAddTrack')} onClick={addTrack} disabled={busy} />
        </div>
      ) : null}

      {/* Step: arrange */}
      {step === 'arrange' ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary-ink"><Music2 className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h3 className="font-semibold text-ink">{t('songCreate.wizardArrangeTitle')}</h3>
              <p className="text-sm text-muted">{t('songCreate.wizardArrangeHint')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h4 className="font-semibold text-ink">{t('songCreate.wizardVersionsTitle')}</h4><p className="text-sm text-muted">{t('songCreate.wizardVersionsOptionalHint')}</p></div>
            </div>
            <section className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5" aria-labelledby="initial-version-heading">
              <header><h4 id="initial-version-heading" className="font-semibold text-ink">{t('songCreate.wizardVersionNumber', { number: 1 })}</h4><p className="mt-1 text-sm text-muted">{t('songCreate.wizardSelectedSong')}: <span className="font-medium text-ink">{title.trim()}</span></p></header>
              <GroupInput label={t('songCreate.wizardArrangementLabel')} value={initialVersionLabel} maxLength={120} disabled={busy} onChange={(event) => setInitialVersionLabel(event.target.value)} placeholder={t('songCreate.wizardFirstVersionNameHint')} />
            <GroupTextArea
              label={t('song.lyricsLabel')}
              value={lyrics}
              rows={4}
              maxLength={100000}
              disabled={busy}
              onChange={(event) => setLyrics(event.target.value)}
              hint={t('workflow.arrangementHint')}
            />
            <FileDropzone title={t('songCreate.wizardVersionAudio')} description={t('songCreate.wizardAudioFormats')} chooseLabel={t('songCreate.wizardChooseFile')} removeLabel={t('songCreate.wizardRemoveFile')} accept={AUDIO_ACCEPT} maxSizeBytes={maxAudioBytes} file={file} onFileChange={pickFile} disabled={busy} icon={Music2} selectedDetail={file ? `${formatBytes(file.size)} · ${formatDuration(durationMs)}` : undefined} testId="song-version-audio-1" />
            {file ? <SongAudioPreview file={file} /> : null}
            <button
              type="button"
              aria-expanded={Boolean(expandedVersionDetails.initial)}
              onClick={() => toggleVersionDetails('initial')}
              className="min-h-11 rounded-lg text-sm font-medium text-primary-ink underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t(expandedVersionDetails.initial ? 'songCreate.wizardHideMusicDetails' : 'songCreate.wizardMoreMusicDetails')}
            </button>
            {expandedVersionDetails.initial ? (
              <div className="space-y-4 rounded-xl border border-border-subtle bg-surface-hover p-4">
                <p className="text-sm text-muted">{t('songCreate.wizardMusicDetailsHint')}</p>
                <GroupTextArea label={t('songCreate.wizardChords')} value={chords} rows={4} maxLength={100000} disabled={busy} onChange={(event) => setChords(event.target.value)} hint={t('songCreate.wizardChordsHint')} />
                <div className="grid gap-4 sm:grid-cols-2">
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
                    min={1}
                    max={400}
                    step={1}
                    value={defaultBpm}
                    disabled={busy}
                    onChange={(event) => setDefaultBpm(event.target.value)}
                  />
                </div>
                <GroupTextArea label={t('songCreate.wizardSectionsTitle')} value={sections.join('\n')} rows={3} maxLength={5000} disabled={busy} onChange={(event) => setSections(event.target.value.split('\n'))} hint={t('songCreate.wizardStructureHint')} />
              </div>
            ) : null}
            </section>
          </div>
          {extraVersions.map((version, index) => (
            <section key={version.id} className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5" aria-labelledby={`extra-version-${version.id}`}>
              <header className="flex items-center justify-between gap-3"><div><h4 id={`extra-version-${version.id}`} className="font-semibold text-ink">{t('songCreate.wizardVersionNumber', { number: index + 2 })}</h4><p className="text-sm text-muted">{t('songCreate.wizardVersionAudioHint')}</p></div><GroupButton variant="ghost" type="button" onClick={() => setExtraVersions((current) => current.filter((item) => item.id !== version.id))} disabled={busy || savedSong.current !== null}><Trash2 className="h-4 w-4" aria-hidden="true" />{t('songCreate.wizardRemove')}</GroupButton></header>
              <GroupInput label={t('songCreate.wizardArrangementLabel')} value={version.label} maxLength={120} disabled={busy} onChange={(event) => updateVersion(version.id, { label: event.target.value })} placeholder={t('songCreate.wizardVersionNameHint', { number: index + 2 })} />
              <GroupTextArea label={t('song.lyricsLabel')} value={version.lyrics} rows={4} maxLength={100000} disabled={busy} onChange={(event) => updateVersion(version.id, { lyrics: event.target.value })} />
              <button type="button" aria-expanded={Boolean(expandedVersionDetails[version.id])} onClick={() => toggleVersionDetails(version.id)} className="min-h-11 text-sm font-medium text-primary-ink underline underline-offset-4">{t(expandedVersionDetails[version.id] ? 'songCreate.wizardHideMusicDetails' : 'songCreate.wizardMoreMusicDetails')}</button>
              {expandedVersionDetails[version.id] ? <div className="space-y-4 rounded-xl border border-border-subtle bg-surface-hover p-4"><p className="text-sm text-muted">{t('songCreate.wizardMusicDetailsHint')}</p><GroupTextArea label={t('songCreate.wizardChords')} value={version.chords} rows={4} maxLength={100000} disabled={busy} onChange={(event) => updateVersion(version.id, { chords: event.target.value })} hint={t('songCreate.wizardChordsHint')} /><div className="grid gap-4 sm:grid-cols-2"><GroupInput label={t('songCreate.wizardKey')} value={version.key} maxLength={12} disabled={busy} onChange={(event) => updateVersion(version.id, { key: event.target.value })} /><GroupInput label={t('songCreate.wizardBpm')} type="number" min={1} max={400} value={version.bpm} disabled={busy} onChange={(event) => updateVersion(version.id, { bpm: event.target.value })} /></div><GroupTextArea label={t('songCreate.wizardSectionsTitle')} value={version.structure} rows={3} maxLength={5000} disabled={busy} onChange={(event) => updateVersion(version.id, { structure: event.target.value })} hint={t('songCreate.wizardStructureHint')} /></div> : null}
              <div className="space-y-3">
                <GroupButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full justify-between"
                  aria-expanded={Boolean(expandedVersionAudio[version.id])}
                  aria-controls={`version-audio-manager-${version.id}`}
                  onClick={() => setExpandedVersionAudio((current) => ({ ...current, [version.id]: !current[version.id] }))}
                  disabled={busy || savedSong.current !== null}
                >
                  <span className="flex items-center gap-2"><Music2 className="h-4 w-4" aria-hidden="true" />{t('songCreate.wizardManageVersionAudio')}</span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary-ink">
                    {t(version.audioFiles.filter((audio) => audio.file).length === 1 ? 'songCreate.wizardAudioCountOne' : 'songCreate.wizardAudioCountMany', { count: version.audioFiles.filter((audio) => audio.file).length })}
                  </span>
                </GroupButton>
                {expandedVersionAudio[version.id] ? (
                  <div id={`version-audio-manager-${version.id}`} className="space-y-3 rounded-xl border border-border-subtle bg-surface-hover/50 p-3 sm:p-4">
                    {version.audioFiles.length === 0 ? <p className="text-sm text-muted">{t('songCreate.wizardNoVersionAudio')}</p> : null}
                    {version.audioFiles.map((audio, audioIndex) => (
                      <div key={audio.id} className="space-y-3 rounded-xl border border-border-subtle bg-surface p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-ink">{t('songCreate.wizardAudioSlot', { number: audioIndex + 1 })}</span>
                          <GroupButton type="button" variant="ghost" size="sm" aria-label={t('songCreate.wizardRemoveVersionAudio', { number: audioIndex + 1 })} onClick={() => removeVersionAudio(version.id, audio.id)} disabled={busy || savedSong.current !== null}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />{t('songCreate.wizardRemove')}
                          </GroupButton>
                        </div>
                        <FileDropzone title={t('songCreate.wizardVersionAudio')} description={t('songCreate.wizardAudioFormats')} chooseLabel={t('songCreate.wizardChooseFile')} removeLabel={t('songCreate.wizardRemoveFile')} accept={AUDIO_ACCEPT} maxSizeBytes={maxAudioBytes} file={audio.file} onFileChange={(next) => pickVersionFile(version.id, audio.id, next)} disabled={busy || savedSong.current !== null} icon={Music2} testId={`song-version-audio-${index + 2}-${audioIndex + 1}`} />
                        {audio.file ? <SongAudioPreview file={audio.file} /> : null}
                      </div>
                    ))}
                    <GroupButton type="button" variant="secondary" onClick={() => addVersionAudio(version.id)} disabled={busy || savedSong.current !== null}>
                      <Music2 className="h-4 w-4" aria-hidden="true" />{t('songCreate.wizardAddVersionAudio')}
                    </GroupButton>
                  </div>
                ) : null}
              </div>
            </section>
          ))}
          <SongWizardAddButton buttonRef={addVersionButtonRef} label={t('songCreate.wizardAddVersion')} onClick={addVersion} disabled={busy || savedSong.current !== null} />
        </div>
      ) : null}

      {/* Step: review */}
      {step === 'review' ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary-ink"><ClipboardCheck className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <h3 className="font-semibold text-ink">{t('songCreate.wizardReviewTitle')}</h3>
              <p className="text-sm text-muted">{t('songCreate.wizardReviewHint')}</p>
            </div>
          </div>

          <section className="rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5" aria-labelledby="review-details-heading">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 id="review-details-heading" className="font-semibold text-ink">{t('songCreate.wizardDetailsTitle')}</h4>
              <GroupButton variant="secondary" onClick={() => { detailsEditedFromReview.current = true; setStep('details') }} disabled={savedSong.current !== null}><Pencil className="h-4 w-4" aria-hidden="true" />{t('songCreate.wizardEdit')}</GroupButton>
            </header>
            <dl className="space-y-2 text-sm">
              <ReviewRow label={t('songCreate.titleLabel')} value={title.trim()} />
              <ReviewRow label={t('songCreate.originLabel')} value={originOptions.find((option) => option.value === originKind)?.label ?? ''} />
              {attribution.trim() ? <ReviewRow label={t('songCreate.wizardArtist')} value={attribution.trim()} /> : null}
              {album.trim() ? <ReviewRow label={t('songCreate.albumLabel')} value={album.trim()} /> : null}
              {releaseYear.trim() ? <ReviewRow label={t('songCreate.releaseYearLabel')} value={releaseYear.trim()} /> : null}
              {tags.length ? <ReviewRow label={t('songCreate.tagsLabel')} value={tags.join(', ')} /> : null}
              {description.trim() ? <ReviewRow label={t('workflow.rightsNotes')} value={description.trim()} /> : null}
            </dl>
          </section>

          <section className="rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5" aria-labelledby="review-audio-heading">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 id="review-audio-heading" className="font-semibold text-ink">{t('songCreate.wizardReviewAudio')}</h4>
              <GroupButton variant="secondary" onClick={() => { setReviewReturnStep('audio'); setStep('audio') }} disabled={savedSong.current !== null}><Pencil className="h-4 w-4" aria-hidden="true" />{t('songCreate.wizardEdit')}</GroupButton>
            </header>
            <p className="text-sm text-muted">{file ? `${file.name} · ${formatBytes(file.size)} · ${formatDuration(durationMs)}` : t('songCreate.wizardReviewNoAudio')}</p>
          </section>

          <section className="rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5" aria-labelledby="review-version-heading">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 id="review-version-heading" className="font-semibold text-ink">{t('songCreate.wizardArrangeTitle')}</h4>
              <GroupButton variant="secondary" onClick={() => { setReviewReturnStep('review'); setStep('arrange') }} disabled={savedSong.current !== null}><Pencil className="h-4 w-4" aria-hidden="true" />{t('songCreate.wizardEdit')}</GroupButton>
            </header>
            {willCreateArrangement ? (
              <dl className="space-y-2 text-sm">
                {willCreateInitialArrangement ? <ReviewRow label={t('songCreate.wizardVersionNumber', { number: 1 })} value={initialVersionLabel.trim() || t('songCreate.wizardDefaultInitialVersion')} /> : null}
                {willCreateInitialArrangement ? <>
                  {defaultKey.trim() ? <ReviewRow label={t('songCreate.wizardKey')} value={defaultKey.trim()} /> : null}
                  {defaultBpm.trim() ? <ReviewRow label={t('songCreate.wizardBpm')} value={defaultBpm.trim()} /> : null}
                  {lyrics.trim() ? <ReviewRow label={t('arrangement.lyricsLabel')} value={t('workflow.lyricsIncluded')} /> : null}
                  {chords.trim() ? <ReviewRow label={t('songCreate.wizardChords')} value={t('workflow.lyricsIncluded')} /> : null}
                  {sections.length ? <ReviewRow label={t('songCreate.wizardSectionsTitle')} value={sections.join(' · ')} /> : null}
                </> : null}
                {extraVersions.map((version, index) => {
                  const audioCount = version.audioFiles.filter((audio) => audio.file).length
                  return <span key={version.id} className="block space-y-2 border-t border-border-subtle pt-2 first:border-t-0"><ReviewRow label={t('songCreate.wizardVersionNumber', { number: index + 2 })} value={version.label.trim() || t('songCreate.wizardDefaultArrangement')} />{version.key.trim() ? <ReviewRow label={t('songCreate.wizardKey')} value={version.key.trim()} /> : null}{version.bpm.trim() ? <ReviewRow label={t('songCreate.wizardBpm')} value={version.bpm.trim()} /> : null}{version.lyrics.trim() ? <ReviewRow label={t('arrangement.lyricsLabel')} value={t('workflow.lyricsIncluded')} /> : null}{version.chords.trim() ? <ReviewRow label={t('songCreate.wizardChords')} value={t('workflow.lyricsIncluded')} /> : null}{version.structure.trim() ? <ReviewRow label={t('songCreate.wizardSectionsTitle')} value={version.structure.trim()} /> : null}{audioCount > 0 ? <ReviewRow label={t('songCreate.wizardManageVersionAudio')} value={t(audioCount === 1 ? 'songCreate.wizardAudioCountOne' : 'songCreate.wizardAudioCountMany', { count: audioCount })} /> : null}</span>
                })}
              </dl>
            ) : <p className="text-sm text-muted">{t('songCreate.wizardReviewNoArrangement')}</p>}
          </section>

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
      <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-right font-medium text-ink">{value}</dd>
    </div>
  )
}
