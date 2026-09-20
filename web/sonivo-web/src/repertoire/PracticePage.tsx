import { useEffect, useState } from 'react'
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
import { PracticeEventQueue } from './PracticeEventQueue'
import { PracticePlayer } from './PracticePlayer'
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
import {
  ConfirmDialog,
  isOwnerRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from './ui'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'

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
  return (
    <div
      className="space-y-3 rounded-xl border border-slate-200 bg-neutral-light p-4"
      role="status"
      aria-live="polite"
      aria-label="Cargando plan del evento…"
      data-testid="practice-queue-skeleton"
    >
      <span className="sr-only">Cargando plan del evento…</span>
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
  const [searchParams] = useSearchParams()
  const eventId = searchParams.get('eventId')
  const planItemId = searchParams.get('item')
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const isOwner = isOwnerRole(group?.role)
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

  useEffect(() => {
    setSemitoneOffset(0)
    setAudioSeconds(0)
    if (!groupId || !arrangementId) {
      setViewMode('guitarist')
      setFollowAlong(false)
      return
    }
    setViewMode(readPracticeViewMode(groupId, arrangementId))
    setFollowAlong(readPracticeFollowAlong(groupId, arrangementId))
  }, [groupId, arrangementId])

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
  }, [groupId, arrangementId, group])

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

  if (group === undefined) {
    return <PracticePageSkeleton label="Cargando práctica…" />
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="font-semibold text-primary no-underline hover:underline" to="/">
          Mis grupos
        </Link>
      </div>
    )
  }

  if (arrangement === undefined) {
    return <PracticePageSkeleton label="Cargando práctica…" />
  }

  if (arrangement === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? 'No se encontró el arreglo o no tienes acceso.'} />
        <Link
          className="font-semibold text-primary no-underline hover:underline"
          to={`/groups/${group.id}/library`}
        >
          Biblioteca
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
  const displayTitle = queueItem?.displaySongTitle ?? songTitle ?? 'Canción'
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
  const highlightBlock =
    followAlong && timingMarks.length > 0
      ? activeChordLineBlock(timingMarks, Math.round(audioSeconds * 1000))
      : null

  function setViewModePersist(mode: PracticeViewMode) {
    setViewMode(mode)
    writePracticeViewMode(liveGroup.id, liveArrangement.id, mode)
  }

  function setFollowAlongPersist(enabled: boolean) {
    setFollowAlong(enabled)
    writePracticeFollowAlong(liveGroup.id, liveArrangement.id, enabled)
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
        { to: `/groups/${liveGroup.id}/events`, label: 'Eventos' },
        {
          to: `/groups/${liveGroup.id}/events/${eventId}`,
          label: eventDetail?.title ?? 'Evento',
        },
        { label: 'Ensayar plan' },
      ]
    : [
        { to: `/groups/${liveGroup.id}`, label: liveGroup.name },
        { to: `/groups/${liveGroup.id}/library`, label: 'Biblioteca' },
        { to: songHref, label: songTitle ?? 'Canción' },
        { to: arrangementHref, label: liveArrangement.label },
        { label: 'Practicar' },
      ]

  return (
    <section className="space-y-7" aria-labelledby="practice-heading">
      <div className="space-y-3">
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-600">
            {eventId ? 'Ensayar plan' : 'Practicar'}
          </p>
          <h1 id="practice-heading" className="text-2xl font-bold tracking-tight text-neutral-dark sm:text-[1.75rem]">
            {displayTitle}
          </h1>
          <p className="text-base text-slate-700">{displayLabel}</p>
          <p className="text-sm text-slate-600">
            {liveArrangement.defaultKey
              ? `Tonalidad: ${liveArrangement.defaultKey}`
              : 'Tonalidad: —'}
            {' · '}
            {liveArrangement.defaultBpm != null
              ? `Tempo: ${liveArrangement.defaultBpm} BPM`
              : 'Tempo: —'}
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
          title="Este evento aún no tiene plan"
          description="Cuando el organizador aplique una lista, podrás ensayar las canciones en orden."
          action={
            <Link
              className="font-semibold text-primary no-underline hover:underline"
              to={`/groups/${liveGroup.id}/events/${eventId}`}
            >
              Volver al evento
            </Link>
          }
        />
      ) : null}

      {tracks.length > 0 ? (
        <PracticePlayer
          groupId={liveGroup.id}
          arrangementId={liveArrangement.id}
          tracks={tracks}
          onCurrentTimeChange={setAudioSeconds}
        />
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
            Tono y vista
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              data-testid="practice-transpose-down"
              onClick={() => setSemitoneOffset((n) => n - 1)}
            >
              Tono −1
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-testid="practice-transpose-up"
              onClick={() => setSemitoneOffset((n) => n + 1)}
            >
              Tono +1
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-testid="practice-transpose-reset"
              disabled={semitoneOffset === 0}
              onClick={() => setSemitoneOffset(0)}
            >
              Restablecer preview
            </Button>
          </div>
          <p className="text-sm text-slate-600" data-testid="practice-transpose-offset">
            Desplazamiento:{' '}
            {semitoneOffset > 0 ? `+${semitoneOffset}` : String(semitoneOffset)}
            {effectiveKeyHint ? ` · Efectiva: ${effectiveKeyHint}` : null}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Vista de ensayo">
            <Button
              variant={viewMode === 'singer' ? 'primary' : 'secondary'}
              size="sm"
              data-testid="practice-view-singer"
              aria-pressed={viewMode === 'singer'}
              onClick={() => setViewModePersist('singer')}
            >
              Vista Cantante
            </Button>
            <Button
              variant={viewMode === 'guitarist' ? 'primary' : 'secondary'}
              size="sm"
              data-testid="practice-view-guitarist"
              aria-pressed={viewMode === 'guitarist'}
              onClick={() => setViewModePersist('guitarist')}
            >
              Vista Guitarrista
            </Button>
            {timingMarks.length > 0 ? (
              <Button
                variant={followAlong ? 'primary' : 'secondary'}
                size="sm"
                data-testid="practice-follow-along"
                aria-pressed={followAlong}
                onClick={() => setFollowAlongPersist(!followAlong)}
              >
                Seguir letra
              </Button>
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
                Guardar tono
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="practice-lyrics-heading">
        <h2 id="practice-lyrics-heading" className="text-lg font-semibold tracking-tight text-neutral-dark">
          Letra
        </h2>
        {(() => {
          if (!sourceBody) {
            return (
              <EmptyPanel
                title="Sin letra ni acordes"
                description="Este arreglo aún no tiene letra ni acordes para ensayar."
                action={
                  <Link
                    className="font-semibold text-primary no-underline hover:underline"
                    to={arrangementHref}
                  >
                    Ver el arreglo
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

      <p>
        {eventId ? (
          <Link
            className="inline-flex min-h-11 items-center font-semibold text-primary no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            to={`/groups/${group.id}/events/${eventId}`}
          >
            Volver al evento
          </Link>
        ) : (
          <Link
            className="inline-flex min-h-11 items-center font-semibold text-primary no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            to={arrangementHref}
          >
            Volver al arreglo
          </Link>
        )}
      </p>

      <ConfirmDialog
        open={confirmSaveTone}
        title="¿Guardar tono?"
        confirmLabel="Guardar tono"
        cancelLabel="Cancelar"
        pendingLabel="Guardando…"
        pending={savingTone}
        onCancel={() => setConfirmSaveTone(false)}
        onConfirm={() => void handleSaveTone()}
      >
        <p>
          Se actualizarán los acordes ChordPro del arreglo
          {effectiveKeyHint ? ` y la tonalidad a ${effectiveKeyHint}` : ''}. Esta
          acción no se puede deshacer con Restablecer preview.
        </p>
      </ConfirmDialog>
    </section>
  )
}
