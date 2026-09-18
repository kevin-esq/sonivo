import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  getArrangement,
  getEvent,
  getSong,
  type ArrangementDetail,
  type CurrentUser,
  type EventDetail,
  type EventPlanItem,
} from '../api/client'
import { PageBreadcrumb } from './chrome'
import { RehearsalBodyView } from './ChordProView'
import { PracticeEventQueue } from './PracticeEventQueue'
import { PracticePlayer } from './PracticePlayer'
import { listPracticeAudioTracks, type PracticeAudioSource } from './pickPracticeAudio'
import { mutationErrorMessage, ProblemAlert, useGroupContext } from './ui'

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

export function PracticePage({ user }: { user: CurrentUser }) {
  const { groupId, arrangementId } = useParams()
  const [searchParams] = useSearchParams()
  const eventId = searchParams.get('eventId')
  const planItemId = searchParams.get('item')
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [arrangement, setArrangement] = useState<ArrangementDetail | null | undefined>(undefined)
  const [songTitle, setSongTitle] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tracks, setTracks] = useState<PracticeAudioSource[]>([])
  const [eventDetail, setEventDetail] = useState<EventDetail | null | undefined>(
    eventId ? undefined : null,
  )
  const [queueError, setQueueError] = useState<string | null>(null)

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
    return <p aria-live="polite">Cargando práctica…</p>
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
    return <p aria-live="polite">Cargando práctica…</p>
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

  const arrangementHref = `/groups/${group.id}/arrangements/${arrangement.id}`
  const songHref = `/groups/${group.id}/songs/${arrangement.songId}`
  const queueItems = eventDetail?.items ?? []
  const queueItem =
    eventDetail && arrangementId
      ? resolveQueueItem(queueItems, arrangementId, planItemId)
      : null
  const displayTitle = queueItem?.displaySongTitle ?? songTitle ?? 'Canción'
  const displayLabel = queueItem?.displayArrangementLabel ?? arrangement.label

  const breadcrumbItems = eventId
    ? [
        { to: `/groups/${group.id}`, label: group.name },
        { to: `/groups/${group.id}/events`, label: 'Eventos' },
        {
          to: `/groups/${group.id}/events/${eventId}`,
          label: eventDetail?.title ?? 'Evento',
        },
        { label: 'Ensayar plan' },
      ]
    : [
        { to: `/groups/${group.id}`, label: group.name },
        { to: `/groups/${group.id}/library`, label: 'Biblioteca' },
        { to: songHref, label: songTitle ?? 'Canción' },
        { to: arrangementHref, label: arrangement.label },
        { label: 'Practicar' },
      ]

  return (
    <section className="space-y-6" aria-labelledby="practice-heading">
      <div className="space-y-3">
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            {eventId ? 'Ensayar plan' : 'Practicar'}
          </p>
          <h1 id="practice-heading" className="text-2xl font-bold tracking-tight">
            {displayTitle}
          </h1>
          <p className="text-base text-slate-600">{displayLabel}</p>
          <p className="text-sm text-slate-500">
            {arrangement.defaultKey ? `Tonalidad: ${arrangement.defaultKey}` : 'Tonalidad: —'}
            {' · '}
            {arrangement.defaultBpm != null
              ? `Tempo: ${arrangement.defaultBpm} BPM`
              : 'Tempo: —'}
          </p>
        </div>
      </div>

      <ProblemAlert message={error} />
      <ProblemAlert message={queueError} />

      {eventId && eventDetail === undefined ? (
        <p aria-live="polite">Cargando plan del evento…</p>
      ) : null}

      {eventId && eventDetail && queueItems.length > 0 ? (
        <PracticeEventQueue
          groupId={group.id}
          eventId={eventId}
          eventTitle={eventDetail.title}
          items={queueItems}
          currentItemId={queueItem?.id ?? null}
        />
      ) : null}

      {eventId && eventDetail && queueItems.length === 0 ? (
        <p className="text-sm text-slate-500">Este evento aún no tiene plan de canciones.</p>
      ) : null}

      {tracks.length > 0 ? (
        <PracticePlayer
          groupId={group.id}
          arrangementId={arrangement.id}
          tracks={tracks}
        />
      ) : null}

      <section className="space-y-3" aria-labelledby="practice-lyrics-heading">
        <h2 id="practice-lyrics-heading" className="text-lg font-semibold">
          Letra
        </h2>
        {(() => {
          const body = arrangement.chords?.trim() || arrangement.lyrics?.trim() || ''
          if (!body) {
            return (
              <p className="text-sm text-slate-500">
                Este arreglo aún no tiene letra ni acordes.
              </p>
            )
          }
          return (
            <RehearsalBodyView
              text={body}
              chordProTestId="practice-chordpro"
              plainTestId="practice-lyrics"
            />
          )
        })()}
      </section>

      <p>
        {eventId ? (
          <Link
            className="font-semibold text-primary no-underline hover:underline"
            to={`/groups/${group.id}/events/${eventId}`}
          >
            Volver al evento
          </Link>
        ) : (
          <Link
            className="font-semibold text-primary no-underline hover:underline"
            to={arrangementHref}
          >
            Volver al arreglo
          </Link>
        )}
      </p>
    </section>
  )
}
