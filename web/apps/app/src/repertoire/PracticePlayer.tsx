import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n'
import { Button } from '../ui/button'
import { useAudioPlayer } from './AudioPlayerContext'
import type { PracticeAudioSource } from './pickPracticeAudio'
import {
  readPracticePlayerPrefs,
  writePracticePlayerPrefs,
} from './practicePlayerPrefs'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  const m = Math.floor(whole / 60)
  const s = whole % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

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

/**
 * Practice player. It no longer creates its own <audio>: it publishes the track
 * to the shared AudioPlayerContext, so the rail (and the bottom bar on mobile)
 * show and control the SAME playback.
 */
export function PracticePlayer({
  groupId,
  arrangementId,
  tracks,
  onCurrentTimeChange,
  onPlayingChange,
  followSeekMs,
}: {
  groupId: string
  arrangementId: string
  tracks: PracticeAudioSource[]
  onCurrentTimeChange?: (seconds: number) => void
  onPlayingChange?: (playing: boolean) => void
  /** ADR-0036: conductor follow — when set, the playhead jumps here. */
  followSeekMs?: number | null
}) {
  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    volume,
    loadTrack,
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
  const appliedFollowSeekMs = useRef<number | null>(null)
  const seekId = useId()
  const volumeId = useId()
  const trackId = useId()

  const selected =
    tracks.find((t) => t.resourceId === selectedId) ?? resolveInitialTrack(tracks, null)

  // Cues the selected track in the shared engine (paused).
  useEffect(() => {
    loadTrack({ id: selected.resourceId, title: selected.label, url: selected.src })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.resourceId, selected.src])

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

  function onSeek(value: number) {
    const next = Number.isFinite(value) ? value : 0
    seek(next)
  }

  function onTrackChange(resourceId: string) {
    if (resourceId === selected.resourceId) return
    setSelectedId(resourceId)
  }

  const seekMax = duration > 0 ? duration : 0
  const volumePct = Math.round(volume * 100)
  const hasTrack = currentTrack?.id === selected.resourceId

  return (
    <section
      className="space-y-4 rounded-xl border border-border-subtle bg-surface p-4 sm:p-5 shadow-sm"
      aria-labelledby="practice-audio-heading"
      data-testid="practice-player"
    >
      <div className="space-y-1">
        <h2 id="practice-audio-heading" className="text-lg font-semibold tracking-tight text-ink">
          {t('practice.audio.title')}
        </h2>
        <p className="text-sm text-muted">{t('practice.audio.subtitle')}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={trackId} className="block text-sm font-medium text-ink">
          {t('practice.audio.trackLabel')}
        </label>
        <select
          id={trackId}
          className="min-h-11 w-full max-w-xl rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-sm"
          value={selected.resourceId}
          onChange={(e) => onTrackChange(e.target.value)}
          data-testid="practice-track-select"
        >
          {tracks.map((track) => (
            <option key={track.resourceId} value={track.resourceId}>
              {track.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          className="min-h-11 min-w-28"
          onClick={() => void togglePlay()}
          aria-label={isPlaying ? t('player.pause') : t('player.play')}
          disabled={!hasTrack}
          data-testid="practice-play-pause"
        >
          {isPlaying ? t('player.pause') : t('player.play')}
        </Button>
        <p
          className="tabular-nums text-sm font-medium text-ink"
          aria-live="off"
          aria-label={`${t('practice.audio.timeLabel')} ${formatTime(progress)} ${t('practice.audio.ofWord')} ${formatTime(duration)}`}
        >
          <span data-testid="practice-current-time">{formatTime(progress)}</span>
          {' / '}
          <span data-testid="practice-duration">{formatTime(duration)}</span>
        </p>
      </div>

      <div className="max-w-xl space-y-1.5">
        <label htmlFor={seekId} className="block text-sm font-medium text-ink">
          {t('practice.audio.position')}
        </label>
        <input
          id={seekId}
          type="range"
          min={0}
          max={seekMax || 1}
          step={0.1}
          value={Math.min(progress, seekMax || 1)}
          disabled={seekMax <= 0}
          onInput={(e) => onSeek(Number((e.target as HTMLInputElement).value))}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="h-11 w-full accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-valuetext={`${formatTime(progress)} ${t('practice.audio.ofWord')} ${formatTime(duration)}`}
          data-testid="practice-seek"
        />
      </div>

      <div className="max-w-xs space-y-1.5">
        <label htmlFor={volumeId} className="block text-sm font-medium text-ink">
          {t('practice.audio.volume', { percent: volumePct })}
        </label>
        <input
          id={volumeId}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="h-11 w-full accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-valuetext={t('practice.audio.volumeValue', { percent: volumePct })}
          data-testid="practice-volume"
        />
      </div>
    </section>
  )
}
