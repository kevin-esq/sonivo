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
import { looksLikeChordPro, transposeChordPro, tryTransposeDefaultKey } from './chordPro'
import { RehearsalBodyView } from './ChordProView'
import {
  activeChordLineBlock,
  parseChordTimingJson,
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
import { StageModePanel } from './StageModePanel'
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

type PracticeTab = 'estudiar' | 'avanzado' | 'afinar'

function parsePracticeTab(value: string | null): PracticeTab {
  if (value === 'avanzado' || value === 'afinar') return value
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
      <div className="space-y-3 rounded-xl border border-slate-100 p-4">
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
      className="space-y-3 rounded-xl border border-slate-200 bg-neutral-light p-4"
      role="status"
      aria-live="polite"
      aria-label={t('practica.queueLoading')}
      data-testid="practice-queue-skeleton"
    >
      <span className="sr-only">{t('practica.queueLoading')}</span>
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
  const { t } = useT()
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
        setError(mutationErrorMessage(err))
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
        setQueueError(mutationErrorMessage(err))
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

  if (group === undefined) {
    return <PracticePageSkeleton label={t('practica.loading')} />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="font-semibold text-primary-ink no-underline hover:underline" to="/">
          {t('practica.myGroups')}
        </Link>
      </div>
    )
  }

  if (arrangement === undefined) {
    return <PracticePageSkeleton label={t('practica.loading')} />
  }

  if (arrangement === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? t('practica.notFound')} />
        <Link
          className="font-semibold text-primary-ink no-underline hover:underline"
          to={`/groups/${group.id}/library`}
        >
          {t('practica.library')}
        </Link>
      </div>
    )
  }

  // Narrowed after early returns above — capture for nested handlers (TS).
  const liveGroup = group
  const liveArrangement = arrangement

  const arrangementHref = `/groups/${liveGroup.id}/arrangements/${liveArrangement.id}`
  const songHref = `/groups/${liveGroup.id}/songs/${liveArrangement.songId}`
  const queueItems = eventDetail?.items ?? []
  const queueItem =
    eventDetail && arrangementId
      ? resolveQueueItem(queueItems, arrangementId, planItemId)
      : null
  const displayTitle = queueItem?.displaySongTitle ?? songTitle ?? t('practica.songFallback')
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
  const timingMarks = parseChordTimingJson(liveArrangement.chordTimingJson)
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
      setError(mutationErrorMessage(err))
      setConfirmSaveTone(false)
    } finally {
      setSavingTone(false)
    }
  }

  const breadcrumbItems = eventId
    ? [
        { to: `/groups/${liveGroup.id}`, label: liveGroup.name },
        { to: `/groups/${liveGroup.id}/events`, label: t('agenda.eventsTitle') },
        {
          to: `/groups/${liveGroup.id}/events/${eventId}`,
          label: eventDetail?.title ?? t('practica.eventFallback'),
        },
        { label: t('practica.rehearsePlan') },
      ]
    : [
        { to: `/groups/${liveGroup.id}`, label: liveGroup.name },
        { to: `/groups/${liveGroup.id}/library`, label: t('practica.library') },
        { to: songHref, label: songTitle ?? t('practica.songFallback') },
        { to: arrangementHref, label: liveArrangement.label },
        { label: t('practica.kicker') },
      ]

  const tabLabels: Record<PracticeTab, string> = {
    estudiar: t('practica.tabs.estudiar'),
    avanzado: t('practica.tabs.avanzado'),
    afinar: t('practica.tabs.afinar'),
  }
  const tabOrder: PracticeTab[] = ['estudiar', 'avanzado', 'afinar']

  return (
    <section className="space-y-7" aria-labelledby="practice-heading">
      <div className="space-y-3">
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-600">
            {eventId ? t('practica.rehearsePlan') : t('practica.kicker')}
          </p>
          <h1 id="practice-heading" className="text-2xl font-bold tracking-tight text-neutral-dark sm:text-[1.75rem]">
            {displayTitle}
          </h1>
          <p className="text-base text-slate-700">{displayLabel}</p>
          <p className="text-sm text-slate-600">
            {liveArrangement.defaultKey
              ? `${t('practica.keyPrefix')}${liveArrangement.defaultKey}`
              : t('practica.keyEmpty')}
            {' · '}
            {liveArrangement.defaultBpm != null
              ? `${t('practica.tempoPrefix')}${liveArrangement.defaultBpm}${t('practica.bpmSuffix')}`
              : t('practica.tempoEmpty')}
          </p>
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
          title={t('practica.noPlanTitle')}
          description={t('practica.noPlanBody')}
          action={
            <Link
              className="font-semibold text-primary-ink no-underline hover:underline"
              to={`/groups/${liveGroup.id}/events/${eventId}`}
            >
              {t('practica.backToEvent')}
            </Link>
          }
        />
      ) : null}

      <div
        className="flex gap-1 rounded-xl bg-neutral-light p-1"
        role="tablist"
        aria-label={t('practica.tabs.label')}
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
              'min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              tab === id
                ? 'bg-white text-neutral-dark shadow-sm'
                : 'text-slate-500 hover:text-neutral-dark',
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

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="practice-tuner-heading">
        <h2 id="practice-tuner-heading" className="text-base font-semibold tracking-tight text-neutral-dark">
          {t('practica.tunerTitle')}
        </h2>
        <TunerPanel />
      </section>

      {referenceResources.length > 0 ? (
        <section className="space-y-4" aria-labelledby="practice-reference-heading">
          <h2 id="practice-reference-heading" className="text-lg font-semibold tracking-tight text-neutral-dark">
            {t('practica.referenceTitle')}
          </h2>
          {referenceResources.map((resource) => (
            <ReferenceEmbed key={resource.id} resource={resource} />
          ))}
        </section>
      ) : null}

      {canTranspose ? (
        <section
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
          aria-labelledby="practice-transpose-heading"
        >
          <h2
            id="practice-transpose-heading"
            className="text-base font-semibold tracking-tight text-neutral-dark"
          >
            {t('practica.toneViewTitle')}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              data-testid="practice-transpose-down"
              onClick={() => setSemitoneOffset((n) => n - 1)}
            >
              {t('practica.toneDown')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-testid="practice-transpose-up"
              onClick={() => setSemitoneOffset((n) => n + 1)}
            >
              {t('practica.toneUp')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-testid="practice-transpose-reset"
              disabled={semitoneOffset === 0}
              onClick={() => setSemitoneOffset(0)}
            >
              {t('practica.toneReset')}
            </Button>
          </div>
          <p className="text-sm text-slate-600" data-testid="practice-transpose-offset">
            {t('practica.offsetPrefix')}
            {semitoneOffset > 0 ? `+${semitoneOffset}` : String(semitoneOffset)}
            {effectiveKeyHint ? `${t('practica.effectivePrefix')}${effectiveKeyHint}` : null}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('practica.viewGroupLabel')}>
            <Button
              variant={viewMode === 'singer' ? 'primary' : 'secondary'}
              size="sm"
              data-testid="practice-view-singer"
              aria-pressed={viewMode === 'singer'}
              onClick={() => setViewModePersist('singer')}
            >
              {t('practica.viewSinger')}
            </Button>
            <Button
              variant={viewMode === 'guitarist' ? 'primary' : 'secondary'}
              size="sm"
              data-testid="practice-view-guitarist"
              aria-pressed={viewMode === 'guitarist'}
              onClick={() => setViewModePersist('guitarist')}
            >
              {t('practica.viewGuitarist')}
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
                    {t('practica.followLyrics')}
                  </Button>
                  <p
                    className="text-xs text-slate-500"
                    data-testid="practice-follow-along-youtube-note"
                  >
                    {t('practica.youtubeNote')}
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
                  {t('practica.followLyrics')}
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
                {t('practica.saveTone')}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {sourceBody ? (
        <StageModePanel
          text={displayBody}
          hideChords={hideChords}
          timingMarks={timingMarks}
          currentMs={highlightMs}
        />
      ) : null}

      <section className="space-y-3" aria-labelledby="practice-lyrics-heading">
        <h2 id="practice-lyrics-heading" className="text-lg font-semibold tracking-tight text-neutral-dark">
          {t('practica.lyricsTitle')}
        </h2>
        {(() => {
          if (!sourceBody) {
            return (
              <EmptyPanel
                title={t('practica.noLyricsTitle')}
                description={t('practica.noLyricsBody')}
                action={
                  <Link
                    className="font-semibold text-primary-ink no-underline hover:underline"
                    to={arrangementHref}
                  >
                    {t('practica.viewArrangement')}
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

      {tab === 'avanzado' ? (
        <div
          className="space-y-7"
          role="tabpanel"
          id="practice-panel-avanzado"
          aria-labelledby="practice-tab-avanzado"
          data-testid="practice-panel-avanzado"
        >
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-neutral-dark">
              {t('practica.avanzado.title')}
            </h2>
            <p className="text-sm text-slate-600">{t('practica.avanzado.hint')}</p>
          </div>

          <section
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
            aria-labelledby="practice-advanced-timing-heading"
          >
            <h3
              id="practice-advanced-timing-heading"
              className="text-base font-semibold tracking-tight text-neutral-dark"
            >
              {t('practica.avanzado.timingTitle')}
            </h3>
            <p className="text-sm text-slate-600">{t('practica.avanzado.timingHint')}</p>
            <p>
              <Link
                className="inline-flex min-h-11 items-center font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                to={arrangementHref}
                data-testid="practice-advanced-timing-link"
              >
                {t('practica.avanzado.timingLink')}
              </Link>
            </p>
          </section>

          <section
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
            aria-labelledby="practice-advanced-digitize-heading"
          >
            <h3
              id="practice-advanced-digitize-heading"
              className="text-base font-semibold tracking-tight text-neutral-dark"
            >
              {t('practica.avanzado.digitizeTitle')}
            </h3>
            <p className="text-sm text-slate-600">{t('practica.avanzado.digitizeHint')}</p>
            <p>
              <Link
                className="inline-flex min-h-11 items-center font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                to={arrangementHref}
                data-testid="practice-advanced-digitize-link"
              >
                {t('practica.avanzado.digitizeLink')}
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
                  className="rounded-xl border border-slate-200 bg-neutral-light px-3 py-2 text-sm text-slate-600"
                  data-testid="practice-advanced-digitize-empty"
                >
                  {t('practica.avanzado.digitizeEmpty')}
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
            <p className="text-sm text-slate-600" data-testid="practice-advanced-conductor-hint">
              {t('practica.avanzado.conductorHint')}
            </p>
          )}
        </div>
      ) : null}

      {tab === 'afinar' ? (
        <section
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
          role="tabpanel"
          id="practice-panel-afinar"
          aria-labelledby="practice-tab-afinar"
          data-testid="practice-panel-afinar"
        >
          <h2 className="text-lg font-semibold tracking-tight text-neutral-dark">
            {t('practica.afinar.title')}
          </h2>
          <p className="text-sm text-slate-600">{t('practica.afinar.hint')}</p>
          <TunerPanel />
        </section>
      ) : null}

      <p>
        {eventId ? (
          <Link
            className="inline-flex min-h-11 items-center font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            to={`/groups/${group.id}/events/${eventId}`}
          >
            {t('practica.backToEvent')}
          </Link>
        ) : (
          <Link
            className="inline-flex min-h-11 items-center font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            to={arrangementHref}
          >
            {t('practica.backToArrangement')}
          </Link>
        )}
      </p>

      <ConfirmDialog
        open={confirmSaveTone}
        title={t('practica.saveToneTitle')}
        confirmLabel={t('practica.saveTone')}
        cancelLabel={t('practica.cancel')}
        pendingLabel={t('practica.saving')}
        pending={savingTone}
        onCancel={() => setConfirmSaveTone(false)}
        onConfirm={() => void handleSaveTone()}
      >
        <p>
          {t('practica.saveToneBody')}
          {effectiveKeyHint ? `${t('practica.saveToneBodyKey')}${effectiveKeyHint}` : ''}{t('practica.saveToneBodySuffix')}
        </p>
      </ConfirmDialog>
    </section>
  )
}
