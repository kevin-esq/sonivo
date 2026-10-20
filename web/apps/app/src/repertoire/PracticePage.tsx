import { routes } from '../routing/routes'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  getArrangement,
  getEvent,
  getSong,
  updateArrangement,
  type ArrangementDetail,
  type CurrentUser,
  type EventDetail,
  type EventPlanItem,
} from '../api/client'
import { EmptyPanel, PageBreadcrumb } from './chrome'
import { fieldClass } from '../ui/field'
import { looksLikeChordPro, transposeChordPro, tryTransposeDefaultKey } from './chordPro'
import { RehearsalBodyView } from './ChordProView'
import {
  activeChordLineBlock,
  parseChordTimingTimeline,
} from './chordTiming'
import { ConductorPanel } from './ConductorPanel'
import { ReferenceEmbed } from './ReferenceEmbed'
import { TunerPanel } from './TunerPanel'
import { AudioDigitizer } from './AudioDigitizer'
import { isYouTubeReference } from './youtubeRef'
import {
  readConductorFollow,
  writeConductorFollow,
} from './conductorFollowPrefs'
import { useConductorRoom } from './useConductorRoom'
import { PracticeEventQueue } from './PracticeEventQueue'
import { PracticePlayer } from './PracticePlayer'
import { PracticeWarmup } from './PracticeWarmup'
import { useAudioPlayer } from './AudioPlayerContext'
import { StageModePanel } from './StageModePanel'
import { StageOutputPage } from './StageOutputPage'
import { isStageDisplaySessionId } from './stageDisplaySync'
import {
  readPracticeFollowAlong,
  writePracticeFollowAlong,
} from './practiceFollowPrefs'
import {
  readPracticeViewMode,
  writePracticeViewMode,
  type PracticeViewMode,
} from './practiceViewPrefs'
import { listPracticeAudioTracks, type PracticeAudioSource } from './pickPracticeAudio'
import { isDigitizableResource } from './digitize'
import {
  ConfirmDialog,
  canManageContentRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from './ui'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { cn } from '../ui/cn'
import { useT } from '../i18n'

type PracticeTab = 'estudiar' | 'calentar' | 'avanzado' | 'afinar'

function parsePracticeTab(value: string | null): PracticeTab {
  if (value === 'calentar' || value === 'avanzado' || value === 'afinar') return value
  return 'estudiar'
}

function resolveQueueItem(
  items: EventPlanItem[],
  arrangementId: string,
  itemId: string | null,
): EventPlanItem | null {
  if (itemId) {
    const byId = items.find((item) => item.id === itemId)
    if (byId) return byId
  }
  return items.find((item) => item.arrangementId === arrangementId) ?? null
}

function PracticePageSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56 max-w-full" />
      </div>
      <div className="space-y-3 rounded-xl border border-border-subtle p-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-11 w-full max-w-xl" />
        <Skeleton className="h-11 w-28" />
        <Skeleton className="h-3 w-full max-w-xl" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}

function QueueSkeleton() {
  const { t } = useT()
  return (
    <div
      className="space-y-3 rounded-xl border border-border-subtle bg-surface-hover p-4"
      role="status"
      aria-live="polite"
      aria-label={t('practice.queueLoading')}
      data-testid="practice-queue-skeleton"
    >
      <span className="sr-only">{t('practice.queueLoading')}</span>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-32" />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-11 w-28" />
        <Skeleton className="h-11 w-28" />
      </div>
    </div>
  )
}

export function PracticePage({ user }: { user: CurrentUser }) {
  const { groupId, arrangementId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const eventId = searchParams.get('eventId')
  const planItemId = searchParams.get('item')
  const tab = parsePracticeTab(searchParams.get('tab'))
  const stageOutputRequested = searchParams.get('stageOutput') === '1'
  const stageSessionId = searchParams.get('stageSession')
  const { t } = useT()
  const audioPlayer = useAudioPlayer()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const isOwner = canManageContentRole(group?.role)
  const [arrangement, setArrangement] = useState<ArrangementDetail | null | undefined>(undefined)
  const [songTitle, setSongTitle] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tracks, setTracks] = useState<PracticeAudioSource[]>([])
  const [eventDetail, setEventDetail] = useState<EventDetail | null | undefined>(
    eventId ? undefined : null,
  )
  const [queueError, setQueueError] = useState<string | null>(null)
  const [semitoneOffset, setSemitoneOffset] = useState(0)
  const [viewMode, setViewMode] = useState<PracticeViewMode>('guitarist')
  const [confirmSaveTone, setConfirmSaveTone] = useState(false)
  const [savingTone, setSavingTone] = useState(false)
  const [followAlong, setFollowAlong] = useState(false)
  const [metronomeBpm, setMetronomeBpm] = useState(72)
  const [metronomeOn, setMetronomeOn] = useState(false)
  const [metronomePulse, setMetronomePulse] = useState(false)
  const [audioSeconds, setAudioSeconds] = useState(0)
  const [reloadNonce, setReloadNonce] = useState(0)
  // ADR-0036 conductor follow (Event rooms only).
  const conductor = useConductorRoom(eventId)
  const [followDirector, setFollowDirector] = useState(false)
  const [followSeekMs, setFollowSeekMs] = useState<number | null>(null)
  const audioSecondsRef = useRef(0)
  const audioPlayingRef = useRef(false)
  const sendPositionRef = useRef(conductor.sendPosition)
  sendPositionRef.current = conductor.sendPosition

  useEffect(() => {
    setSemitoneOffset(0)
    setAudioSeconds(0)
    audioSecondsRef.current = 0
    audioPlayingRef.current = false
    setFollowSeekMs(null)
    if (!groupId || !arrangementId) {
      setViewMode('guitarist')
      setFollowAlong(false)
      setFollowDirector(false)
      return
    }
    setViewMode(readPracticeViewMode(groupId, arrangementId))
    setFollowAlong(readPracticeFollowAlong(groupId, arrangementId))
    setFollowDirector(eventId ? readConductorFollow(eventId) : false)
  }, [groupId, arrangementId, eventId])

  useEffect(() => {
    if (!groupId || !arrangementId || !group) return
    let cancelled = false
    async function load() {
      setArrangement(undefined)
      setSongTitle(null)
      setTracks([])
      setError(null)
      try {
        const result = await getArrangement(groupId!, arrangementId!)
        if (cancelled) return
        setArrangement(result)
        setTracks(listPracticeAudioTracks(result.resources, groupId!, arrangementId!))
        try {
          const song = await getSong(groupId!, result.songId)
          if (!cancelled) setSongTitle(song.title)
        } catch {
          if (!cancelled) setSongTitle(null)
        }
      } catch (err) {
        if (cancelled) return
        setArrangement(null)
        setError(mutationErrorMessage(err, t))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, arrangementId, group, reloadNonce])

  useEffect(() => {
    if (!groupId || !group || !eventId) {
      setEventDetail(null)
      setQueueError(null)
      return
    }
    let cancelled = false
    async function loadEvent() {
      setEventDetail(undefined)
      setQueueError(null)
      try {
        const detail = await getEvent(groupId!, eventId!)
        if (cancelled) return
        setEventDetail(detail)
      } catch (err) {
        if (cancelled) return
        setEventDetail(null)
        setQueueError(mutationErrorMessage(err, t))
      }
    }
    void loadEvent()
    return () => {
      cancelled = true
    }
  }, [groupId, group, eventId])

  // ADR-0036 follower: a broadcast for this Arrangement moves the local
  // playhead (PracticePlayer seeks) and the follow-along highlight.
  useEffect(() => {
    const last = conductor.lastPosition
    if (!followDirector || isOwner || !last || !arrangementId) return
    if (last.position.arrangementId !== arrangementId) return
    setFollowSeekMs(last.position.positionMs)
  }, [conductor.lastPosition, followDirector, isOwner, arrangementId])

  // ADR-0036 conductor: the Owner broadcasts their player position at 1 Hz
  // (Q9-Q1 client pacing; the server drops anything inside its 900 ms gap).
  useEffect(() => {
    if (!isOwner || !eventId || conductor.connectionState !== 'connected' || !arrangementId) {
      return
    }
    const timer = setInterval(() => {
      sendPositionRef.current(
        arrangementId,
        Math.round(audioSecondsRef.current * 1000),
        audioPlayingRef.current,
      )
    }, 1000)
    return () => clearInterval(timer)
  }, [isOwner, eventId, conductor.connectionState, arrangementId])

  // ADR-0057: best-effort metronome (visual pulse + optional audio click).
  useEffect(() => {
    if (!metronomeOn) return
    let audio: AudioContext | null = null
    let cancelled = false
    const interval = 60_000 / metronomeBpm
    const beat = () => {
      if (cancelled) return
      setMetronomePulse((pulse) => !pulse)
      try {
        audio ??= new AudioContext()
        const osc = audio.createOscillator()
        const gain = audio.createGain()
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.001, audio.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.08)
        osc.connect(gain).connect(audio.destination)
        osc.start()
        osc.stop(audio.currentTime + 0.1)
      } catch {
        // audio unavailable; the visual pulse still works
      }
    }
    beat()
    const timer = setInterval(beat, interval)
    return () => {
      cancelled = true
      clearInterval(timer)
      void audio?.close()
    }
  }, [metronomeOn, metronomeBpm])

  if (group === undefined) {
    return <PracticePageSkeleton label={t('practice.loading')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="font-semibold text-primary-ink no-underline hover:underline" to={routes.home}>
          {t('practice.myGroups')}
        </Link>
      </div>
    )
  }

  if (arrangement === undefined) {
    return <PracticePageSkeleton label={t('practice.loading')} />
  }

  if (arrangement === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? t('practice.notFound')} />
        <Link
          className="font-semibold text-primary-ink no-underline hover:underline"
          to={routes.groupLibrary(group.id)}
        >
          {t('practice.library')}
        </Link>
      </div>
    )
  }

  // Narrowed after early returns above — capture for nested handlers (TS).
  const liveGroup = group
  const liveArrangement = arrangement

  const arrangementHref = routes.groupArrangement(liveGroup.id, liveArrangement.id)
  const songHref = routes.groupSong(liveGroup.id, liveArrangement.songId)
  const queueItems = eventDetail?.items ?? []
  const queueItem =
    eventDetail && arrangementId
      ? resolveQueueItem(queueItems, arrangementId, planItemId)
      : null
  const displayTitle = queueItem?.displaySongTitle ?? songTitle ?? t('practice.songFallback')
  const displayLabel = queueItem?.displayArrangementLabel ?? liveArrangement.label

  const sourceBody = liveArrangement.chords?.trim() || liveArrangement.lyrics?.trim() || ''
  const chordProSource = liveArrangement.chords?.trim() || ''
  const canTranspose = looksLikeChordPro(chordProSource || sourceBody)
  const displayBody =
    canTranspose && semitoneOffset !== 0
      ? transposeChordPro(sourceBody, semitoneOffset)
      : sourceBody
  const effectiveKeyHint =
    liveArrangement.defaultKey && semitoneOffset !== 0
      ? tryTransposeDefaultKey(liveArrangement.defaultKey, semitoneOffset)
      : null
  const hideChords = viewMode === 'singer'
  const timingTimeline = parseChordTimingTimeline(liveArrangement.chordTimingJson)
  const timingMarks = timingTimeline.lineMarks
  // ADR-0037 T-FX-02: reference links; YouTube ones embed via nocookie iframe.
  const referenceResources = liveArrangement.resources.filter(
    (r) => r.purpose === 'reference' && r.kind === 'link',
  )
  // The inline digitizer needs a WAV audio/practice/click resource; say why when
  // there is none instead of rendering an empty section (W8 P2).
  const digitizableResources = liveArrangement.resources.filter(isDigitizableResource)
  // ADR-0037 / ADR-0031: cross-origin YouTube iframes expose no timeupdate,
  // so follow-along stays file-audio-only. When Practice has timing marks but
  // no file audio and only a YouTube reference to play from, the toggle is
  // disabled with an explanation instead of promising sync it cannot keep.
  const youTubeOnlyPractice =
    tracks.length === 0 && referenceResources.some((r) => isYouTubeReference(r))
  // Conductor follow drives the same highlight path: when the Member follows
  // the director, the broadcast position moves playhead + highlight even when
  // the local "Seguir letra" toggle is off. Without audio tracks the
  // broadcast position itself is the highlight clock.
  const conductorFollowing = !isOwner && followDirector && followSeekMs != null
  const highlightMs =
    tracks.length > 0 ? Math.round(audioSeconds * 1000) : (followSeekMs ?? 0)
  const highlightBlock =
    (followAlong || conductorFollowing) && timingMarks.length > 0
      ? activeChordLineBlock(timingMarks, highlightMs)
      : null
  const conductorLive =
    conductor.connectionState === 'connected' &&
    (isOwner ||
      (conductor.lastPosition != null &&
        Date.now() - conductor.lastPosition.receivedAt < 5000))

  function toggleFollowDirector() {
    if (!eventId) return
    const next = !followDirector
    setFollowDirector(next)
    writeConductorFollow(eventId, next)
  }

  function handleAudioTime(seconds: number) {
    setAudioSeconds(seconds)
    audioSecondsRef.current = seconds
  }

  function handleAudioPlaying(playing: boolean) {
    audioPlayingRef.current = playing
  }

  function setViewModePersist(mode: PracticeViewMode) {
    setViewMode(mode)
    writePracticeViewMode(liveGroup.id, liveArrangement.id, mode)
  }

  function setFollowAlongPersist(enabled: boolean) {
    setFollowAlong(enabled)
    writePracticeFollowAlong(liveGroup.id, liveArrangement.id, enabled)
  }

  function setTabPersist(next: PracticeTab) {
    if (next === tab) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', next)
    setSearchParams(nextParams)
  }

  async function reloadForDigitizer(): Promise<void> {
    setReloadNonce((n) => n + 1)
  }

  async function handleSaveTone() {
    if (!isOwner || semitoneOffset === 0 || !liveArrangement.chords?.trim()) return
    setSavingTone(true)
    setError(null)
    try {
      // defaultKey: update only when it is a single simple chord/key token
      // (e.g. G, Am, F#m). Free-text or multi-token keys are left unchanged.
      const nextKey = tryTransposeDefaultKey(liveArrangement.defaultKey, semitoneOffset)
      const payload: Parameters<typeof updateArrangement>[2] = {
        expectedVersion: liveArrangement.version,
        chords: transposeChordPro(liveArrangement.chords, semitoneOffset),
      }
      if (nextKey != null) {
        payload.defaultKey = nextKey
      }
      const updated = await updateArrangement(liveGroup.id, liveArrangement.id, payload)
      setArrangement(updated)
      setSemitoneOffset(0)
      setConfirmSaveTone(false)
    } catch (err) {
      setError(mutationErrorMessage(err, t))
      setConfirmSaveTone(false)
    } finally {
      setSavingTone(false)
    }
  }

  const breadcrumbItems = eventId
    ? [
        { to: routes.group(liveGroup.id), label: liveGroup.name },
        { to: routes.groupEvents(liveGroup.id), label: t('schedule.eventsTitle') },
        {
          to: routes.groupEvent(liveGroup.id, eventId),
          label: eventDetail?.title ?? t('practice.eventFallback'),
        },
        { label: t('practice.rehearsePlan') },
      ]
    : [
        { to: routes.group(liveGroup.id), label: liveGroup.name },
        { to: routes.groupLibrary(liveGroup.id), label: t('practice.library') },
        { to: songHref, label: songTitle ?? t('practice.songFallback') },
        { to: arrangementHref, label: liveArrangement.label },
        { label: t('practice.kicker') },
      ]

  const visibleBreadcrumbItems = tab === 'calentar'
    ? eventId
      ? [breadcrumbItems[2], breadcrumbItems[3]]
      : [breadcrumbItems[3], breadcrumbItems[4]]
    : breadcrumbItems

  const tabLabels: Record<PracticeTab, string> = {
    estudiar: t('practice.tabs.estudiar'),
    calentar: t('practice.tabs.calentar'),
    avanzado: t('practice.tabs.avanzado'),
    afinar: t('practice.tabs.afinar'),
  }
  const tabOrder: PracticeTab[] = ['estudiar', 'calentar', 'avanzado', 'afinar']

  if (stageOutputRequested && isStageDisplaySessionId(stageSessionId)) {
    return <StageOutputPage text={displayBody} sessionId={stageSessionId} timingMarks={timingMarks} timingTimeline={timingTimeline} />
  }

  return (
    <section className={cn(tab === 'calentar' ? 'space-y-5 sm:space-y-8' : 'space-y-8')} aria-labelledby="practice-heading">
      <div className={cn(
        'rounded-3xl border border-[var(--color-score-border)] bg-[var(--color-score-soft)] text-[var(--color-score-ink)]',
        tab === 'calentar' ? 'space-y-3 p-4 sm:space-y-4 sm:p-8' : 'space-y-4 p-5 sm:p-8',
      )}>
        <PageBreadcrumb items={visibleBreadcrumbItems} />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className={cn('text-sm font-medium uppercase tracking-wide text-muted', tab === 'calentar' && 'hidden')}>
              {eventId ? t('practice.rehearsePlan') : t('practice.kicker')}
            </p>
            <h1 id="practice-heading" className="text-3xl font-bold tracking-tight text-[var(--color-score-ink)] sm:text-4xl">
              {displayTitle}
            </h1>
            <p className="text-base font-medium text-[var(--color-score-ink-soft)]">{displayLabel}</p>
            <p className="text-sm text-[var(--color-score-muted)]">
              {liveArrangement.defaultKey
                ? `${t('practice.keyPrefix')}${liveArrangement.defaultKey}`
                : t('practice.keyEmpty')}
              {' · '}
              {liveArrangement.defaultBpm != null
                ? `${t('practice.tempoPrefix')}${liveArrangement.defaultBpm}${t('practice.bpmSuffix')}`
                : t('practice.tempoEmpty')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sourceBody && tab !== 'calentar' ? (
              <StageModePanel
                text={displayBody}
                timingMarks={timingMarks}
                timingTimeline={timingTimeline}
                currentMs={highlightMs}
                title={displayTitle}
                subtitle={displayLabel}
                hasAudio={tracks.length > 0}
                isPlaying={audioPlayer.isPlaying}
                progress={audioPlayer.progress}
                duration={audioPlayer.duration}
                onTogglePlayback={() => void audioPlayer.togglePlay()}
                onSeek={audioPlayer.seek}
                groupId={liveGroup.id}
                arrangementId={liveArrangement.id}
                volume={audioPlayer.volume}
                onVolumeChange={audioPlayer.setVolume}
              />
            ) : null}
            {isOwner && tab !== 'calentar' ? (
              <Link className="inline-flex min-h-11 items-center rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-ink no-underline transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" to={arrangementHref}>
                {t('practice.editLyrics')}
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <ProblemAlert message={error} />
      <ProblemAlert message={queueError} />

      {eventId && eventDetail === undefined ? <QueueSkeleton /> : null}

      {eventId && eventDetail && queueItems.length > 0 ? (
        <PracticeEventQueue
          groupId={liveGroup.id}
          eventId={eventId}
          eventTitle={eventDetail.title}
          items={queueItems}
          currentItemId={queueItem?.id ?? null}
        />
      ) : null}

      {eventId && eventDetail && queueItems.length === 0 ? (
        <EmptyPanel
          title={t('practice.noPlanTitle')}
          description={t('practice.noPlanBody')}
          action={
            <Link
              className="font-semibold text-primary-ink no-underline hover:underline"
              to={routes.groupEvent(liveGroup.id, eventId)}
            >
              {t('practice.backToEvent')}
            </Link>
          }
        />
      ) : null}

      <div
        className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--color-score-border)] bg-[var(--color-score-soft)] p-1.5 sm:grid-cols-4"
        role="tablist"
        aria-label={t('practice.tabs.label')}
      >
        {tabOrder.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`practice-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`practice-panel-${id}`}
            data-testid={`practice-tab-${id}`}
            className={cn(
              'min-h-12 rounded-xl px-3 py-2 text-sm font-semibold transition duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              tab === id
                ? 'bg-[var(--color-score-paper)] text-[var(--color-score-ink)] shadow-sm'
                : 'text-[var(--color-score-muted)] hover:bg-[var(--color-score-paper-soft)] hover:text-[var(--color-score-ink)]',
            )}
            onClick={() => setTabPersist(id)}
          >
            {tabLabels[id]}
          </button>
        ))}
      </div>

      {tab === 'estudiar' ? (
        <div
          className="space-y-7"
          role="tabpanel"
          id="practice-panel-estudiar"
          aria-labelledby="practice-tab-estudiar"
          data-testid="practice-panel-estudiar"
        >
      {eventId ? (
        <ConductorPanel
          presence={conductor.presence}
          connectionState={conductor.connectionState}
          isOwner={isOwner}
          followEnabled={followDirector}
          onToggleFollow={toggleFollowDirector}
          isLive={conductorLive}
          error={conductor.error}
        />
      ) : null}

      {tracks.length > 0 ? (
        <PracticePlayer
          groupId={liveGroup.id}
          arrangementId={liveArrangement.id}
          tracks={tracks}
          onCurrentTimeChange={handleAudioTime}
          onPlayingChange={handleAudioPlaying}
          followSeekMs={!isOwner && followDirector ? followSeekMs : null}
        />
      ) : null}

      {referenceResources.length > 0 ? (
        <section className="space-y-4" aria-labelledby="practice-reference-heading">
          <h2 id="practice-reference-heading" className="text-lg font-semibold tracking-tight text-ink">
            {t('practice.referenceTitle')}
          </h2>
          {referenceResources.map((resource) => (
            <ReferenceEmbed key={resource.id} resource={resource} />
          ))}
        </section>
      ) : null}

      {canTranspose ? (
        <section
          className="space-y-3 rounded-xl border border-border-subtle bg-surface p-4"
          aria-labelledby="practice-transpose-heading"
        >
          <h2
            id="practice-transpose-heading"
            className="text-base font-semibold tracking-tight text-ink"
          >
            {t('practice.toneViewTitle')}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              data-testid="practice-transpose-down"
              onClick={() => setSemitoneOffset((n) => n - 1)}
            >
              {t('practice.toneDown')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-testid="practice-transpose-up"
              onClick={() => setSemitoneOffset((n) => n + 1)}
            >
              {t('practice.toneUp')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-testid="practice-transpose-reset"
              disabled={semitoneOffset === 0}
              onClick={() => setSemitoneOffset(0)}
            >
              {t('practice.toneReset')}
            </Button>
          </div>
          <p className="text-sm text-muted" data-testid="practice-transpose-offset">
            {t('practice.offsetPrefix')}
            {semitoneOffset > 0 ? `+${semitoneOffset}` : String(semitoneOffset)}
            {effectiveKeyHint ? `${t('practice.effectivePrefix')}${effectiveKeyHint}` : null}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('practice.viewGroupLabel')}>
            <Button
              variant={viewMode === 'singer' ? 'primary' : 'secondary'}
              size="sm"
              data-testid="practice-view-singer"
              aria-pressed={viewMode === 'singer'}
              onClick={() => setViewModePersist('singer')}
            >
              {t('practice.viewSinger')}
            </Button>
            <Button
              variant={viewMode === 'guitarist' ? 'primary' : 'secondary'}
              size="sm"
              data-testid="practice-view-guitarist"
              aria-pressed={viewMode === 'guitarist'}
              onClick={() => setViewModePersist('guitarist')}
            >
              {t('practice.viewGuitarist')}
            </Button>
            {timingMarks.length > 0 ? (
              youTubeOnlyPractice ? (
                <div className="space-y-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="practice-follow-along"
                    aria-disabled="true"
                    aria-pressed={false}
                    disabled
                  >
                    {t('practice.followLyrics')}
                  </Button>
                  <p
                    className="text-xs text-muted"
                    data-testid="practice-follow-along-youtube-note"
                  >
                    {t('practice.youtubeNote')}
                  </p>
                </div>
              ) : (
                <Button
                  variant={followAlong ? 'primary' : 'secondary'}
                  size="sm"
                  data-testid="practice-follow-along"
                  aria-pressed={followAlong}
                  onClick={() => setFollowAlongPersist(!followAlong)}
                >
                  {t('practice.followLyrics')}
                </Button>
              )
            ) : null}
          </div>
          {isOwner && liveArrangement.chords?.trim() ? (
            <div>
              <Button
                variant="outline"
                size="sm"
                data-testid="practice-save-tone"
                disabled={semitoneOffset === 0 || savingTone}
                onClick={() => setConfirmSaveTone(true)}
              >
                {t('practice.saveTone')}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="practice-lyrics-heading">
        <h2 id="practice-lyrics-heading" className="text-lg font-semibold tracking-tight text-ink">
          {t('practice.lyricsTitle')}
        </h2>
        {(() => {
          if (!sourceBody) {
            return (
              <EmptyPanel
                title={t('practice.noLyricsTitle')}
                description={t('practice.noLyricsBody')}
                action={
                  <Link
                    className="font-semibold text-primary-ink no-underline hover:underline"
                    to={arrangementHref}
                  >
                    {t('practice.viewArrangement')}
                  </Link>
                }
              />
            )
          }
          return (
            <RehearsalBodyView
              text={displayBody}
              chordProTestId="practice-chordpro"
              plainTestId="practice-lyrics"
              hideChords={hideChords}
              activeLineIndex={highlightBlock?.lineIndex ?? null}
              activeBlockEndIndex={highlightBlock?.blockEndIndex ?? null}
            />
          )
        })()}
      </section>
        </div>
      ) : null}

      {tab === 'calentar' ? (
        <div
          role="tabpanel"
          id="practice-panel-calentar"
          aria-labelledby="practice-tab-calentar"
          data-testid="practice-panel-calentar"
        >
          <PracticeWarmup
            groupId={liveGroup.id}
            arrangementId={liveArrangement.id}
            songTitle={displayTitle}
            hasAudio={tracks.length > 0}
            isPlaying={audioPlayer.isPlaying}
            progress={audioPlayer.progress}
            duration={audioPlayer.duration}
            volume={audioPlayer.volume}
            metronomeBpm={metronomeBpm}
            metronomeOn={metronomeOn}
            metronomePulse={metronomePulse}
            onTogglePlayback={() => void audioPlayer.togglePlay()}
            onSeek={audioPlayer.seek}
            onVolumeChange={audioPlayer.setVolume}
            onMetronomeBpmChange={setMetronomeBpm}
            onMetronomeToggle={() => setMetronomeOn((on) => !on)}
          />
        </div>
      ) : null}

      {tab === 'avanzado' ? (
        <div
          className="space-y-7"
          role="tabpanel"
          id="practice-panel-avanzado"
          aria-labelledby="practice-tab-avanzado"
          data-testid="practice-panel-avanzado"
        >
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface p-4">
            <span className="text-sm font-medium text-ink">{t('practice.metronomeTitle')}</span>
            <input
              type="number"
              className={cn(fieldClass, 'w-20')}
              min={1}
              max={400}
              value={metronomeBpm}
              disabled={metronomeOn}
              onChange={(e) =>
                setMetronomeBpm(Math.max(1, Math.min(400, Number(e.target.value) || 1)))
              }
              aria-label={t('practice.metronomeBpm')}
            />
            <Button
              variant={metronomeOn ? 'primary' : 'secondary'}
              size="sm"
              data-testid="practice-metronome-toggle"
              onClick={() => setMetronomeOn((on) => !on)}
              aria-pressed={metronomeOn}
            >
              {metronomeOn
                ? t('practice.metronomeStop')
                : t('practice.metronomeStart')}
            </Button>
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-ink">
              {t('practice.avanzado.title')}
            </h2>
            <p className="text-sm text-muted">{t('practice.avanzado.hint')}</p>
          </div>

          <section
            className="space-y-3 rounded-xl border border-border-subtle bg-surface p-4"
            aria-labelledby="practice-advanced-timing-heading"
          >
            <h3
              id="practice-advanced-timing-heading"
              className="text-base font-semibold tracking-tight text-ink"
            >
              {t('practice.avanzado.timingTitle')}
            </h3>
            <p className="text-sm text-muted">{t('practice.avanzado.timingHint')}</p>
            <p>
              <Link
                className="inline-flex min-h-11 items-center font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                to={arrangementHref}
                data-testid="practice-advanced-timing-link"
              >
                {t('practice.avanzado.timingLink')}
              </Link>
            </p>
          </section>

          <section
            className="space-y-3 rounded-xl border border-border-subtle bg-surface p-4"
            aria-labelledby="practice-advanced-digitize-heading"
          >
            <h3
              id="practice-advanced-digitize-heading"
              className="text-base font-semibold tracking-tight text-ink"
            >
              {t('practice.avanzado.digitizeTitle')}
            </h3>
            <p className="text-sm text-muted">{t('practice.avanzado.digitizeHint')}</p>
            <p>
              <Link
                className="inline-flex min-h-11 items-center font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                to={arrangementHref}
                data-testid="practice-advanced-digitize-link"
              >
                {t('practice.avanzado.digitizeLink')}
              </Link>
            </p>
            {isOwner ? (
              digitizableResources.length > 0 ? (
                <AudioDigitizer
                  key={liveArrangement.id}
                  groupId={liveGroup.id}
                  arrangement={liveArrangement}
                  onChanged={reloadForDigitizer}
                />
              ) : (
                <p
                  className="rounded-xl border border-border-subtle bg-surface-hover px-3 py-2 text-sm text-muted"
                  data-testid="practice-advanced-digitize-empty"
                >
                  {t('practice.avanzado.digitizeEmpty')}
                </p>
              )
            ) : null}
          </section>

          {eventId ? (
            <ConductorPanel
              presence={conductor.presence}
              connectionState={conductor.connectionState}
              isOwner={isOwner}
              followEnabled={followDirector}
              onToggleFollow={toggleFollowDirector}
              isLive={conductorLive}
              error={conductor.error}
            />
          ) : (
            <p className="text-sm text-muted" data-testid="practice-advanced-conductor-hint">
              {t('practice.avanzado.conductorHint')}
            </p>
          )}
        </div>
      ) : null}

      {tab === 'afinar' ? (
        <section
          className="space-y-3 rounded-xl border border-border-subtle bg-surface p-4"
          role="tabpanel"
          id="practice-panel-afinar"
          aria-labelledby="practice-tab-afinar"
          data-testid="practice-panel-afinar"
        >
          <h2 className="text-lg font-semibold tracking-tight text-ink">
            {t('practice.afinar.title')}
          </h2>
          <p className="text-sm text-muted">{t('practice.afinar.hint')}</p>
          <TunerPanel />
        </section>
      ) : null}

      <p>
        {eventId ? (
          <Link
            className="inline-flex min-h-11 items-center font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            to={routes.groupEvent(group.id, eventId)}
          >
            {t('practice.backToEvent')}
          </Link>
        ) : (
          <Link
            className="inline-flex min-h-11 items-center font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            to={arrangementHref}
          >
            {t('practice.backToArrangement')}
          </Link>
        )}
      </p>

      <ConfirmDialog
        open={confirmSaveTone}
        title={t('practice.saveToneTitle')}
        confirmLabel={t('practice.saveTone')}
        cancelLabel={t('practice.cancel')}
        pendingLabel={t('practice.saving')}
        pending={savingTone}
        onCancel={() => setConfirmSaveTone(false)}
        onConfirm={() => void handleSaveTone()}
      >
        <p>
          {t('practice.saveToneBody')}
          {effectiveKeyHint ? `${t('practice.saveToneBodyKey')}${effectiveKeyHint}` : ''}{t('practice.saveToneBodySuffix')}
        </p>
      </ConfirmDialog>

    </section>
  )
}
