import { routes } from '../routing/routes'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppLink } from '../routing/AppLink'
import { useGroupShell } from '../shell/GroupShellContext'
import {
  getArrangement,
  getEvent,
  getSong,
  listArrangements,
  updateArrangement,
  type ArrangementDetail,
  type ArrangementListItem,
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
import { isYouTubeLink } from './youtubeRef'
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
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Skeleton } from '../ui/skeleton'
import { cn } from '../ui/cn'
import { useT } from '../i18n'
import { ArrangementVersionDialog } from './ArrangementVersionDialog'
import { GroupDialog } from '../groups/ui'
import { ArrangementDetailPage } from './ArrangementDetailPage'
import { PracticeMaterials } from './PracticeMaterials'

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

export function PracticePage({ user, groupId, arrangementId, search: currentSearch = '' }: { user: CurrentUser; groupId?: string; arrangementId?: string; search?: string }) {
  const { search, navigate, navigationMode } = useGroupShell()
  const activeSearch = (currentSearch || search).replace(/^\?/, '')
  const searchParams = new URLSearchParams(activeSearch)
  const eventId = searchParams.get('eventId')
  const planItemId = searchParams.get('item')
  const tab = parsePracticeTab(searchParams.get('tab'))
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const stageOutputRequested = searchParams.get('stageOutput') === '1'
  const stageSessionId = searchParams.get('stageSession')
  const stageModeRequested = searchParams.get('stageMode') === 'true'
  const { t } = useT()
  const audioPlayer = useAudioPlayer()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const isOwner = canManageContentRole(group?.role)
  const [arrangement, setArrangement] = useState<ArrangementDetail | null | undefined>(undefined)
  const [practiceArrangements, setPracticeArrangements] = useState<ArrangementListItem[]>([])
  const [versionPickerOpen, setVersionPickerOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editDialogSection, setEditDialogSection] = useState<'details' | 'materials' | null>(null)
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean | null>(null)
  const [editDialogDirty, setEditDialogDirty] = useState(false)
  const [songTitle, setSongTitle] = useState<string | null>(null)
  const [songAttribution, setSongAttribution] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tracks, setTracks] = useState<PracticeAudioSource[]>([])
  const [songAudioTracks, setSongAudioTracks] = useState<Array<PracticeAudioSource & { arrangementLabel: string }>>([])
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
  const loadedArrangementKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const viewport = window.matchMedia('(min-width: 768px)')
    const updateViewport = () => setIsDesktopViewport(viewport.matches)
    updateViewport()
    viewport.addEventListener('change', updateViewport)
    return () => viewport.removeEventListener('change', updateViewport)
  }, [])
  const timingTimeline = useMemo(
    () => parseChordTimingTimeline(arrangement?.chordTimingJson),
    [arrangement?.chordTimingJson],
  )
  // ADR-0036 conductor follow (Event rooms only).
  const conductor = useConductorRoom(eventId)
  const [followDirector, setFollowDirector] = useState(false)
  const [followSeekMs, setFollowSeekMs] = useState<number | null>(null)
  const audioSecondsRef = useRef(0)
  const audioPlayingRef = useRef(false)
  const sendPositionRef = useRef(conductor.sendPosition)
  sendPositionRef.current = conductor.sendPosition

  useEffect(() => {
    const syncEditDialog = () => setEditDialogOpen(window.location.hash === '#edit')
    syncEditDialog()
    window.addEventListener('hashchange', syncEditDialog)
    return () => window.removeEventListener('hashchange', syncEditDialog)
  }, [])

  function openEditDialog() {
    setEditDialogOpen(true)
    setEditDialogSection(null)
    setEditDialogDirty(false)
    navigate(`${routes.groupPractice(groupId ?? '', arrangementId ?? '')}${activeSearch ? `?${activeSearch}` : ''}#edit`)
  }

  function openMaterialsEditor() {
    setEditDialogOpen(true)
    setEditDialogSection('materials')
    setEditDialogDirty(false)
    navigate(`${routes.groupPractice(groupId ?? '', arrangementId ?? '')}${activeSearch ? `?${activeSearch}` : ''}#edit`)
  }

  function closeEditDialog() {
    setEditDialogOpen(false)
    setEditDialogSection(null)
    setEditDialogDirty(false)
    navigate(`${routes.groupPractice(groupId ?? '', arrangementId ?? '')}${activeSearch ? `?${activeSearch}` : ''}`)
  }

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
      const routeKey = `${groupId}/${arrangementId}`
      if (loadedArrangementKeyRef.current !== routeKey) {
        setArrangement(undefined)
        setSongTitle(null)
        setSongAttribution(null)
        setTracks([])
        setSongAudioTracks([])
        setPracticeArrangements([])
      }
      setError(null)
      try {
        const result = await getArrangement(groupId!, arrangementId!)
        if (cancelled) return
        setArrangement(result)
        loadedArrangementKeyRef.current = routeKey
        setTracks(listPracticeAudioTracks(result.resources, groupId!, arrangementId!))
        if (!eventId) {
          try {
            const versions = await listArrangements(groupId!, result.songId)
            if (!cancelled) setPracticeArrangements(versions)
            const audioByArrangement = await Promise.all(versions.map(async (version) => {
              const detail = version.id === result.id ? result : await getArrangement(groupId!, version.id)
              return listPracticeAudioTracks(detail.resources, groupId!, version.id)
                .map((track) => ({ ...track, arrangementLabel: version.label }))
            }))
            if (!cancelled) setSongAudioTracks(audioByArrangement.flat())
          } catch {
            if (!cancelled) {
              setPracticeArrangements([])
              setSongAudioTracks(listPracticeAudioTracks(result.resources, groupId!, result.id).map((track) => ({ ...track, arrangementLabel: result.label })))
            }
          }
        }
        try {
          const song = await getSong(groupId!, result.songId)
          if (!cancelled) {
            setSongTitle(song.title)
            setSongAttribution(song.attribution)
          }
        } catch {
          if (!cancelled) {
            setSongTitle(null)
            setSongAttribution(null)
          }
        }
      } catch (err) {
        if (cancelled) return
        setArrangement(null)
        loadedArrangementKeyRef.current = null
        setError(mutationErrorMessage(err, t))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, arrangementId, eventId, group, reloadNonce])

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
        <AppLink className="font-semibold text-primary-ink no-underline hover:underline" to={routes.home}>
          {t('practice.myGroups')}
        </AppLink>
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
        <AppLink
          className="font-semibold text-primary-ink no-underline hover:underline"
          to={routes.groupLibrary(group.id)}
        >
          {t('practice.library')}
        </AppLink>
      </div>
    )
  }

  // Narrowed after early returns above — capture for nested handlers (TS).
  const liveGroup = group
  const liveArrangement = arrangement
  const stageSearchParams = new URLSearchParams(searchParams)
  stageSearchParams.set('tab', 'estudiar')
  stageSearchParams.set('stageMode', 'true')
  const stagePracticeUrl = `${routes.groupPractice(liveGroup.id, liveArrangement.id)}?${stageSearchParams.toString()}`

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
    tracks.length === 0 && referenceResources.some((r) => isYouTubeLink(r))
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

  function selectPracticeArrangement(nextArrangementId: string) {
    if (!groupId || nextArrangementId === arrangementId) return
    const query = searchParams.toString()
    navigate(`${routes.groupPractice(groupId, nextArrangementId)}${query ? `?${query}` : ''}`)
  }

  function setTabPersist(next: PracticeTab) {
    if (next === tab) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', next)
    const query = nextParams.toString()
    navigate(`${routes.groupPractice(groupId ?? '', arrangementId ?? '')}${query ? `?${query}` : ''}`)
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
        { label: displayLabel },
      ]

  const visibleBreadcrumbItems = breadcrumbItems

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
    <section className="space-y-5 sm:space-y-7" aria-labelledby="practice-heading">
      <div className="sonivo-score-header relative isolate space-y-5 overflow-hidden p-5 sm:space-y-6 sm:p-8 xl:p-9">
        <PageBreadcrumb items={visibleBreadcrumbItems} />
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0 space-y-4">
            {eventId ? (
              <p className={cn('text-xs font-semibold uppercase tracking-[0.14em] text-muted', tab === 'calentar' && 'invisible')} aria-hidden={tab === 'calentar'}>{t('practice.rehearsePlan')}</p>
            ) : null}
            <h1 id="practice-heading" className="sonivo-page-title break-words text-4xl leading-[1.05] tracking-tight text-[var(--color-score-ink)] sm:text-5xl xl:text-6xl">
              {displayTitle}
            </h1>
            {!eventId && practiceArrangements.length > 1 ? (
              <button
                id="practice-arrangement-picker"
                type="button"
                aria-label={`${t('practice.versionSelector')}: ${liveArrangement.label}`}
                aria-haspopup="dialog"
                aria-expanded={versionPickerOpen}
                data-testid="practice-arrangement-picker"
                onClick={() => setVersionPickerOpen(true)}
                className="relative flex min-h-14 w-full max-w-md items-center gap-3 rounded-xl border-2 border-[var(--color-score-ink)] bg-transparent px-4 pb-2 pt-3 text-left text-[var(--color-score-ink)] shadow-sm transition-[border-color,box-shadow,background-color] hover:border-[var(--brand-primary)] hover:bg-[var(--color-score-paper-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)] motion-reduce:transition-none"
              >
                <span className="absolute -top-2 left-3 bg-[var(--color-score-paper)] px-1.5 text-sm font-medium text-[var(--color-score-ink)]">
                  {t('practice.activeVersion')}
                </span>
                <span className="min-w-0 flex-1 truncate text-base font-semibold">{liveArrangement.label}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[var(--color-score-muted)]" aria-hidden="true" />
              </button>
            ) : displayLabel !== displayTitle ? (
              <p className="text-base font-medium text-[var(--color-score-ink-soft)]">{displayLabel}</p>
            ) : null}
            {liveArrangement.defaultKey || liveArrangement.defaultBpm != null ? (
              <p className="text-sm text-[var(--color-score-muted)]">
                {liveArrangement.defaultKey ? `${t('practice.keyPrefix')}${liveArrangement.defaultKey}` : null}
                {liveArrangement.defaultKey && liveArrangement.defaultBpm != null ? ' · ' : null}
                {liveArrangement.defaultBpm != null
                  ? `${t('practice.tempoPrefix')}${liveArrangement.defaultBpm}${t('practice.bpmSuffix')}`
                  : null}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {sourceBody ? (
              <div className={tab === 'calentar' ? 'invisible' : undefined} aria-hidden={tab === 'calentar'}>
                <StageModePanel
                  initialOpen={stageModeRequested && tab !== 'calentar'}
                  onInitialOpen={() => {
                    const params = new URLSearchParams(searchParams)
                    params.delete('stageMode')
                    const query = params.toString()
                    const nextUrl = `${routes.groupPractice(groupId ?? '', arrangementId ?? '')}${query ? `?${query}` : ''}`
                    if (navigationMode === 'next') window.history.replaceState(null, '', nextUrl)
                    else navigate(nextUrl, { replace: true })
                  }}
                  text={displayBody}
                  timingMarks={timingMarks}
                  timingTimeline={timingTimeline}
                  currentMs={highlightMs}
                  title={displayTitle}
                  subtitle={songAttribution?.trim() || displayLabel}
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
              </div>
            ) : null}
            {isOwner ? (
              <Button variant="secondary" onClick={openEditDialog}>
                {t('arrangement.editMusic')}
              </Button>
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
            <AppLink
              className="font-semibold text-primary-ink no-underline hover:underline"
              to={routes.groupEvent(liveGroup.id, eventId)}
            >
              {t('practice.backToEvent')}
            </AppLink>
          }
        />
      ) : null}

      <div
        className="flex min-w-0 gap-2 overflow-x-auto border-b border-[var(--color-score-border)]"
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
            tabIndex={tab === id ? 0 : -1}
            ref={(element) => { tabRefs.current[tabOrder.indexOf(id)] = element }}
            data-testid={`practice-tab-${id}`}
            data-tab-surface="practice"
            className={cn(
              'sonivo-tab-trigger min-h-12 shrink-0 rounded-none border-0 border-b-2 bg-transparent px-4 text-sm shadow-none sm:text-base',
              tab === id
                ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                : 'border-transparent text-[var(--color-score-muted)] hover:bg-transparent hover:text-[var(--color-score-ink)]',
            )}
            onClick={() => setTabPersist(id)}
            onKeyDown={(event) => {
              const currentIndex = tabOrder.indexOf(id)
              let nextIndex: number | null = null
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabOrder.length
              if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + tabOrder.length) % tabOrder.length
              if (event.key === 'Home') nextIndex = 0
              if (event.key === 'End') nextIndex = tabOrder.length - 1
              if (nextIndex === null) return
              event.preventDefault()
              const nextTab = tabOrder[nextIndex]
              if (!nextTab) return
              setTabPersist(nextTab)
              tabRefs.current[nextIndex]?.focus()
            }}
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
          lastPositionMs={conductor.lastPosition?.position.positionMs ?? null}
          lastSentPositionMs={conductor.lastSentPositionMs}
        />
      ) : null}

      {tracks.length > 0 ? (
        <PracticePlayer
          key={`practice-player-${liveArrangement.id}`}
          groupId={liveGroup.id}
          userId={user.id}
          songId={liveArrangement.songId}
          arrangementId={liveArrangement.id}
          practiceUrl={stagePracticeUrl}
          artist={songAttribution ?? undefined}
          lyrics={displayBody}
          timingTimeline={timingTimeline}
          tracks={tracks}
          songAudioTracks={songAudioTracks}
          onCurrentTimeChange={handleAudioTime}
          onPlayingChange={handleAudioPlaying}
          followSeekMs={!isOwner && followDirector ? followSeekMs : null}
        />
      ) : null}

      <PracticeMaterials
        key={`practice-materials-${liveArrangement.id}`}
        groupId={liveGroup.id}
        arrangementId={liveArrangement.id}
        resources={liveArrangement.resources}
      />

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
          <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface p-4" aria-labelledby="practice-metronome-heading">
            <h2 id="practice-metronome-heading" className="text-sm font-semibold text-ink">{t('practice.metronomeTitle')}</h2>
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
          </section>

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
              <AppLink
                className="inline-flex min-h-11 items-center font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                to={routes.groupArrangementEdit(liveGroup.id, liveArrangement.id, 'lyrics')}
                data-testid="practice-advanced-timing-link"
              >
                {t('practice.avanzado.timingLink')}
              </AppLink>
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
              <Button onClick={openMaterialsEditor} data-testid="practice-advanced-digitize-link">
                {t('practice.avanzado.digitizeLink')}
              </Button>
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
          lastPositionMs={conductor.lastPosition?.position.positionMs ?? null}
          lastSentPositionMs={conductor.lastSentPositionMs}
            />
          ) : null}
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

      {eventId ? (
        <p>
          <AppLink
            className="inline-flex min-h-11 items-center font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            to={routes.groupEvent(group.id, eventId)}
          >
            {t('practice.backToEvent')}
          </AppLink>
        </p>
      ) : null}

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

      {!eventId && practiceArrangements.length > 1 ? (
        <ArrangementVersionDialog
          arrangements={practiceArrangements}
          selectedArrangementId={liveArrangement.id}
          open={versionPickerOpen}
          onClose={() => setVersionPickerOpen(false)}
          onSelect={selectPracticeArrangement}
          title={t('practice.versionSelector')}
          description={t('practice.versionPickerHint')}
          optionLabel={(label) => t('practice.selectVersion', { label })}
          testId="practice-arrangement-picker-dialog"
          optionTestIdPrefix="practice-arrangement"
        />
      ) : null}

      {isOwner && group && arrangement ? (
        <GroupDialog
          open={editDialogOpen}
          onClose={closeEditDialog}
          title={editDialogSection === 'details' ? t('arrangement.editDetails') : editDialogSection === 'materials' ? t('arrangement.resourcesTitle') : t('arrangement.editArrangement')}
          description={editDialogSection === 'details' ? t('arrangement.editDetailsHint') : editDialogSection === 'materials' ? t('arrangement.resourcesHint') : t('arrangement.editMusicHint')}
          size={editDialogSection ? 'xl' : 'md'}
          mobileFullscreen={editDialogSection !== null}
          fitContent
          confirmDiscard={editDialogDirty}
          testId="arrangement-edit-dialog"
        >
          {editDialogSection ? (
            <ArrangementDetailPage
              user={user}
              groupId={liveGroup.id}
              arrangementId={liveArrangement.id}
              editorSection={editDialogSection}
              embeddedEditor
              onEmbeddedBack={() => {
                setEditDialogSection(null)
                setEditDialogDirty(false)
                setReloadNonce((value) => value + 1)
              }}
              onEmbeddedDirtyChange={setEditDialogDirty}
              onEmbeddedSaved={async (next) => {
                setArrangement(next)
                setEditDialogDirty(false)
                setReloadNonce((value) => value + 1)
                setEditDialogSection(null)
              }}
            />
          ) : <nav aria-label={t('arrangement.editArrangement')}>
            <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface">
              {([
                ['details', t('arrangement.editDetails'), t('arrangement.editDetailsHint')],
                ['lyrics', t('arrangement.editorTitleLyrics'), t('arrangement.editorHintLyrics')],
                ['chords', t('arrangement.editorTitleChords'), t('arrangement.editorHintChords')],
                ['materials', t('arrangement.resourcesTitle'), t('arrangement.editMaterialsHint')],
              ] as const).map(([section, title, hint]) => (
                <li key={section}>
                  <button
                    type="button"
                    className="group flex min-h-20 w-full items-center justify-between gap-4 px-4 py-4 text-left text-ink transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
                    disabled={isDesktopViewport !== true && (section === 'lyrics' || section === 'chords')}
                    onClick={() => {
                      if (section === 'details' || section === 'materials') {
                        setEditDialogSection(section)
                      } else {
                        const returnQuery = new URLSearchParams({ editReturn: 'practice', editReturnSearch: activeSearch }).toString()
                        navigate(`${routes.groupArrangementEdit(group.id, arrangement.id, section)}?${returnQuery}`)
                      }
                    }}
                  >
                    <span className="min-w-0 space-y-1">
                      <span className="block font-semibold">{title}</span>
                      <span className="block text-sm text-muted">{hint}</span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            {isDesktopViewport === false ? <p className="mt-3 text-sm text-muted" role="status">{t('arrangement.editorDesktopOnly')}</p> : null}
          </nav>}
        </GroupDialog>
      ) : null}

    </section>
  )
}
