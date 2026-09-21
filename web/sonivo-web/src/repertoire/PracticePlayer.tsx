import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../ui/button'
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
  const [selectedId, setSelectedId] = useState(() => {
    const prefs = readPracticePlayerPrefs(groupId, arrangementId)
    return resolveInitialTrack(tracks, prefs.resourceId).resourceId
  })
  const [volume, setVolume] = useState(() => {
    const prefs = readPracticePlayerPrefs(groupId, arrangementId)
    return prefs.volume
  })
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const appliedFollowSeekMs = useRef<number | null>(null)
  const seekId = useId()
  const volumeId = useId()
  const trackId = useId()

  const selected =
    tracks.find((t) => t.resourceId === selectedId) ?? resolveInitialTrack(tracks, null)

  useEffect(() => {
    writePracticePlayerPrefs(groupId, arrangementId, {
      volume,
      resourceId: selected.resourceId,
    })
  }, [groupId, arrangementId, volume, selected.resourceId])

  useEffect(() => {
    onCurrentTimeChange?.(currentTime)
  }, [currentTime, onCurrentTimeChange])

  useEffect(() => {
    onPlayingChange?.(playing)
  }, [playing, onPlayingChange])

  // ADR-0036 conductor follow: jump the local playhead to the broadcast
  // position (only when it actually moved, and only when it differs enough
  // to avoid fighting local playback second by second).
  useEffect(() => {
    if (followSeekMs == null || appliedFollowSeekMs.current === followSeekMs) return
    appliedFollowSeekMs.current = followSeekMs
    const el = audioRef.current
    if (!el) return
    const next = followSeekMs / 1000
    if (!Number.isFinite(next) || next < 0) return
    if (Math.abs(el.currentTime - next) > 1) {
      el.currentTime = next
      setCurrentTime(next)
    }
  }, [followSeekMs])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = volume
  }, [volume])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const onTimeUpdate = () => setCurrentTime(el.currentTime)
    const onDurationChange = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0)
    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(el.duration) ? el.duration : 0)
      setCurrentTime(el.currentTime)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => setPlaying(false)

    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('durationchange', onDurationChange)
    el.addEventListener('loadedmetadata', onLoadedMetadata)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('durationchange', onDurationChange)
      el.removeEventListener('loadedmetadata', onLoadedMetadata)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
    }
  }, [selected.src])

  async function togglePlay() {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      try {
        await el.play()
      } catch {
        // Autoplay / decode errors surface via UI state staying paused
      }
    } else {
      el.pause()
    }
  }

  function onSeek(value: number) {
    const el = audioRef.current
    if (!el) return
    const next = Number.isFinite(value) ? value : 0
    el.currentTime = next
    setCurrentTime(next)
  }

  function onTrackChange(resourceId: string) {
    if (resourceId === selected.resourceId) return
    const el = audioRef.current
    if (el) {
      el.pause()
      el.currentTime = 0
    }
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setSelectedId(resourceId)
  }

  const seekMax = duration > 0 ? duration : 0
  const volumePct = Math.round(volume * 100)

  return (
    <section
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      aria-labelledby="practice-audio-heading"
      data-testid="practice-player"
    >
      <div className="space-y-1">
        <h2 id="practice-audio-heading" className="text-lg font-semibold tracking-tight text-neutral-dark">
          Audio de práctica
        </h2>
        <p className="text-sm text-slate-600">Elige una pista y ensaya con la letra abajo.</p>
      </div>

      <audio
        ref={audioRef}
        key={selected.src}
        preload="auto"
        src={selected.src}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      >
        Tu navegador no admite reproducción de audio.
      </audio>

      <div className="space-y-1.5">
        <label htmlFor={trackId} className="block text-sm font-medium text-slate-800">
          Pista
        </label>
        <select
          id={trackId}
          className="min-h-11 w-full max-w-xl rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-neutral-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-sm"
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
          aria-label={playing ? 'Pausar' : 'Reproducir'}
          data-testid="practice-play-pause"
        >
          {playing ? 'Pausar' : 'Reproducir'}
        </Button>
        <p
          className="tabular-nums text-sm font-medium text-slate-700"
          aria-live="off"
          aria-label={`Tiempo ${formatTime(currentTime)} de ${formatTime(duration)}`}
        >
          <span data-testid="practice-current-time">{formatTime(currentTime)}</span>
          {' / '}
          <span data-testid="practice-duration">{formatTime(duration)}</span>
        </p>
      </div>

      <div className="max-w-xl space-y-1.5">
        <label htmlFor={seekId} className="block text-sm font-medium text-slate-800">
          Posición
        </label>
        <input
          id={seekId}
          type="range"
          min={0}
          max={seekMax || 1}
          step={0.1}
          value={Math.min(currentTime, seekMax || 1)}
          disabled={seekMax <= 0}
          onInput={(e) => onSeek(Number((e.target as HTMLInputElement).value))}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="h-11 w-full accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
          data-testid="practice-seek"
        />
      </div>

      <div className="max-w-xs space-y-1.5">
        <label htmlFor={volumeId} className="block text-sm font-medium text-slate-800">
          Volumen ({volumePct}%)
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
          aria-valuetext={`${volumePct} por ciento`}
          data-testid="practice-volume"
        />
      </div>
    </section>
  )
}
