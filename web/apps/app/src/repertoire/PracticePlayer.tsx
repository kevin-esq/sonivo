import { useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useT } from '../i18n'
import { Button } from '../ui/button'
import { useAudioPlayer } from './AudioPlayerContext'
import type { ChordTimingTimeline } from './chordTiming'
import type { PracticeAudioSource } from './pickPracticeAudio'
import {
  readPracticePlayerPrefs,
  writePracticePlayerPrefs,
} from './practicePlayerPrefs'

function resolveInitialTrack(
  tracks: PracticeAudioSource[],
  preferredId: string | null,
): PracticeAudioSource {
  if (preferredId) {
    const match = tracks.find((t) => t.resourceId === preferredId)
    if (match) return match
  }
  return tracks[0]!
}

const TRACKS_PER_PAGE = 5

/**
 * Practice player. It no longer creates its own <audio>: it publishes the track
 * to the shared AudioPlayerContext, so the rail (and the bottom bar on mobile)
 * show and control the SAME playback.
 */
export function PracticePlayer({
  groupId,
  userId,
  songId,
  arrangementId,
  practiceUrl,
  artist,
  lyrics,
  timingTimeline,
  tracks,
  songAudioTracks = tracks.map((track) => ({ ...track, arrangementLabel: '' })),
  onCurrentTimeChange,
  onPlayingChange,
  followSeekMs,
  compact = false,
}: {
  groupId: string
  userId: string
  songId: string
  arrangementId: string
  practiceUrl: string
  artist?: string
  lyrics: string
  timingTimeline: ChordTimingTimeline
  tracks: PracticeAudioSource[]
  songAudioTracks?: Array<PracticeAudioSource & { arrangementLabel: string }>
  onCurrentTimeChange?: (seconds: number) => void
  onPlayingChange?: (playing: boolean) => void
  /** ADR-0036: conductor follow — when set, the playhead jumps here. */
  followSeekMs?: number | null
  compact?: boolean
}) {
  const {
    currentTrack,
    isPlaying,
    progress,
    volume,
    playbackError,
    loadTrack,
    playTrack,
    togglePlay,
    seek,
    setVolume,
  } = useAudioPlayer()
  const { t } = useT()
  const prefs = useMemo(
    () => readPracticePlayerPrefs(groupId, arrangementId),
    [groupId, arrangementId],
  )
  const [selectedId, setSelectedId] = useState(() => {
    const initial = readPracticePlayerPrefs(groupId, arrangementId)
    return resolveInitialTrack(tracks, initial.resourceId).resourceId
  })
  const [trackPage, setTrackPage] = useState(0)
  const appliedFollowSeekMs = useRef<number | null>(null)

  const selected =
    tracks.find((t) => t.resourceId === selectedId) ?? resolveInitialTrack(tracks, null)
  const audioOptions = useMemo(
    () => songAudioTracks.map((track) => ({ id: track.resourceId, title: track.label, url: track.src, arrangementLabel: track.arrangementLabel })),
    [songAudioTracks],
  )
  const pageCount = Math.max(1, Math.ceil(tracks.length / TRACKS_PER_PAGE))
  const selectedIndex = tracks.findIndex((track) => track.resourceId === selected.resourceId)
  const visibleTracks = tracks.slice(trackPage * TRACKS_PER_PAGE, (trackPage + 1) * TRACKS_PER_PAGE)

  useEffect(() => {
    if (selectedIndex >= 0) setTrackPage(Math.floor(selectedIndex / TRACKS_PER_PAGE))
  }, [selectedIndex])

  useEffect(() => {
    if (currentTrack?.arrangementId !== arrangementId) return
    const matchingTrack = tracks.find((track) => track.resourceId === currentTrack.id)
    if (matchingTrack) setSelectedId(matchingTrack.resourceId)
  }, [arrangementId, currentTrack?.arrangementId, currentTrack?.id, tracks])

  // Cues the selected track in the shared engine (paused).
  useEffect(() => {
    loadTrack({
      id: selected.resourceId,
      title: selected.label,
      artist,
      url: selected.src,
      userId,
      groupId,
      songId,
      arrangementId,
      practiceUrl,
      lyrics,
      timingTimeline,
      audioOptions,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.resourceId, selected.src, userId, groupId, songId, arrangementId, practiceUrl, artist, lyrics, timingTimeline])

  // The practice volume is per arrangement; it is applied to the engine on entry.
  useEffect(() => {
    setVolume(prefs.volume)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, arrangementId])

  useEffect(() => {
    writePracticePlayerPrefs(groupId, arrangementId, {
      volume,
      resourceId: selected.resourceId,
    })
  }, [groupId, arrangementId, volume, selected.resourceId])

  useEffect(() => {
    onCurrentTimeChange?.(progress)
  }, [progress, onCurrentTimeChange])

  useEffect(() => {
    onPlayingChange?.(isPlaying)
  }, [isPlaying, onPlayingChange])

  // ADR-0036 conductor follow: jump the shared playhead to the broadcast
  // position (only when it actually moved, and only when it differs enough
  // to avoid fighting local playback second by second).
  useEffect(() => {
    if (followSeekMs == null || appliedFollowSeekMs.current === followSeekMs) return
    appliedFollowSeekMs.current = followSeekMs
    const next = followSeekMs / 1000
    if (!Number.isFinite(next) || next < 0) return
    if (Math.abs(progress - next) > 1) {
      seek(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followSeekMs])

  function onTrackChange(resourceId: string) {
    if (currentTrack?.id === resourceId) {
      void togglePlay()
      return
    }
    const track = tracks.find((item) => item.resourceId === resourceId)
    if (!track) return
    setSelectedId(resourceId)
    playTrack({
      id: track.resourceId,
      title: track.label,
      artist,
      url: track.src,
      userId,
      groupId,
      songId,
      arrangementId,
      practiceUrl,
      lyrics,
      timingTimeline,
      audioOptions,
    })
  }

  return (
    <section
      className="space-y-3"
      aria-labelledby="practice-audio-heading"
      data-testid="practice-player"
    >
      <h2 id="practice-audio-heading" className="sr-only">{t('practice.audio.title')}</h2>
      <div className="min-w-0">
        <div className="space-y-2" role="group" aria-label={t('practice.audio.tracksLabel')}>
          {visibleTracks.map((track, index) => {
            const isPlayingTrack = currentTrack?.id === track.resourceId && isPlaying
            return (
            <button
              key={track.resourceId}
              type="button"
              aria-pressed={track.resourceId === selected.resourceId}
              onClick={() => onTrackChange(track.resourceId)}
              className={`flex w-full items-center rounded-2xl border text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${compact ? 'min-h-14 gap-3 px-3 py-2' : 'min-h-20 gap-4 px-4 py-3'} ${track.resourceId === selected.resourceId ? 'border-[color-mix(in_srgb,var(--brand-primary)_38%,var(--color-score-border))] bg-[color-mix(in_srgb,var(--brand-primary)_10%,var(--color-score-paper))] text-[var(--color-score-ink)]' : 'border-[var(--color-score-border)] bg-[var(--color-score-paper)] text-[var(--color-score-ink)] hover:bg-[var(--color-score-paper-soft)]'}`}
              data-testid="practice-track-option"
            >
              <span className={`grid shrink-0 place-items-center rounded-full bg-[var(--brand-primary)] text-[var(--brand-on-primary)] shadow-sm ${compact ? 'h-9 w-9' : 'h-12 w-12'}`} aria-hidden="true">
                {isPlayingTrack ? <Pause className={compact ? 'h-4 w-4' : 'h-5 w-5'} fill="currentColor" /> : <Play className={`ml-0.5 ${compact ? 'h-4 w-4' : 'h-5 w-5'}`} fill="currentColor" />}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className={`truncate font-semibold ${compact ? 'text-sm' : 'text-base'}`}>{track.label}</span>
                {isPlayingTrack ? <AudioLines className="h-4 w-4 shrink-0 text-[var(--brand-primary)]" aria-hidden="true" data-testid="practice-track-playing" /> : null}
              </span>
              <span className="shrink-0 rounded-full border border-[var(--color-score-border)] bg-[var(--color-score-paper-soft)] px-3 py-1 text-xs font-medium text-[var(--color-score-ink-soft)]">{t('practice.audio.trackNumber', { number: trackPage * TRACKS_PER_PAGE + index + 1 })}</span>
            </button>
            )
          })}
        </div>
        {pageCount > 1 ? <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-sm tabular-nums text-muted">{t('practice.audio.page', { current: trackPage + 1, total: pageCount })}</span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" className="min-h-11 min-w-11 px-2" disabled={trackPage === 0} onClick={() => setTrackPage((page) => Math.max(0, page - 1))} aria-label={t('practice.audio.previousPage')}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" variant="secondary" size="sm" className="min-h-11 min-w-11 px-2" disabled={trackPage + 1 >= pageCount} onClick={() => setTrackPage((page) => Math.min(pageCount - 1, page + 1))} aria-label={t('practice.audio.nextPage')}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div> : null}
      </div>

      {playbackError ? (
        <p role="alert" className="text-sm text-error-ink" data-testid="practice-audio-error">
          {playbackError === 'unsupported' ? t('player.unsupportedAudio') : t('player.playbackFailed')}
        </p>
      ) : null}

    </section>
  )
}
