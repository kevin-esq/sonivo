import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AudioLines, Pause, Play, Volume2 } from 'lucide-react'
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
    playbackError,
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
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0
  const volumePct = Math.round(volume * 100)
  const hasTrack = currentTrack?.id === selected.resourceId

  return (
    <section
      className="relative isolate overflow-hidden rounded-[1.5rem] border border-border-subtle bg-surface p-4 shadow-sm sm:p-6"
      aria-labelledby="practice-audio-heading"
      data-testid="practice-player"
    >
      <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-6">
        <div aria-hidden="true" className="relative grid aspect-square w-full max-w-[7.5rem] place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_35%_30%,color-mix(in_srgb,var(--brand-primary)_88%,white),color-mix(in_srgb,var(--brand-primary)_35%,var(--color-score-ink))_58%,var(--color-score-ink))] text-white shadow-md">
          <AudioLines className="h-10 w-10 drop-shadow" strokeWidth={1.5} />
          <span className="absolute inset-x-0 bottom-0 h-1 bg-[var(--brand-primary)]" style={{ transform: `scaleX(${progressPercent})`, transformOrigin: 'left' }} />
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h2 id="practice-audio-heading" className="text-lg font-semibold tracking-tight text-ink">{t('practice.audio.title')}</h2>
              <p className="text-sm text-muted">{t('practice.audio.subtitle')}</p>
            </div>
            <label className="sr-only" htmlFor={trackId}>{t('practice.audio.trackLabel')}</label>
            <select id={trackId} className="min-h-11 max-w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" value={selected.resourceId} onChange={(e) => onTrackChange(e.target.value)} data-testid="practice-track-select">
              {tracks.map((track) => <option key={track.resourceId} value={track.resourceId}>{track.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="min-w-10 text-right text-xs tabular-nums text-muted" data-testid="practice-current-time">{formatTime(progress)}</span>
            <input id={seekId} type="range" min={0} max={seekMax || 1} step={0.1} value={Math.min(progress, seekMax || 1)} disabled={seekMax <= 0} onInput={(e) => onSeek(Number((e.target as HTMLInputElement).value))} onChange={(e) => onSeek(Number(e.target.value))} className="h-11 min-w-0 flex-1 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-valuetext={`${formatTime(progress)} ${t('practice.audio.ofWord')} ${formatTime(duration)}`} aria-label={t('practice.audio.position')} data-testid="practice-seek" />
            <span className="min-w-10 text-xs tabular-nums text-muted" data-testid="practice-duration">{formatTime(duration)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="primary" className="min-h-12 min-w-12 rounded-full px-4" onClick={() => void togglePlay()} aria-label={isPlaying ? t('player.pause') : t('player.play')} disabled={!hasTrack} data-testid="practice-play-pause">
              {isPlaying ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
              <span className="sr-only">{isPlaying ? t('player.pause') : t('player.play')}</span>
            </Button>
            <div className="flex min-w-0 items-center gap-2 text-muted">
              <Volume2 className="hidden h-4 w-4 sm:block" aria-hidden="true" />
              <label className="sr-only" htmlFor={volumeId}>{t('practice.audio.volume', { percent: volumePct })}</label>
              <input id={volumeId} type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="h-11 w-24 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-32" aria-valuetext={t('practice.audio.volumeValue', { percent: volumePct })} aria-label={t('practice.audio.volume', { percent: volumePct })} data-testid="practice-volume" />
              <span className="w-9 text-right text-xs tabular-nums">{volumePct}%</span>
            </div>
          </div>
        </div>
      </div>

      {playbackError ? (
        <p role="alert" className="text-sm text-error-ink" data-testid="practice-audio-error">
          {playbackError === 'unsupported' ? t('player.unsupportedAudio') : t('player.playbackFailed')}
        </p>
      ) : null}

    </section>
  )
}
