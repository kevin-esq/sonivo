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
}: {
  groupId: string
  arrangementId: string
  tracks: PracticeAudioSource[]
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

  return (
    <section
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-labelledby="practice-audio-heading"
      data-testid="practice-player"
    >
      <h2 id="practice-audio-heading" className="text-lg font-semibold">
        Reproducir
      </h2>

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

      <div className="space-y-1">
        <label htmlFor={trackId} className="block text-sm font-medium text-slate-700">
          Pista
        </label>
        <select
          id={trackId}
          className="w-full max-w-xl rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
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
          size="sm"
          onClick={() => void togglePlay()}
          aria-label={playing ? 'Pausar' : 'Reproducir'}
          data-testid="practice-play-pause"
        >
          {playing ? 'Pausar' : 'Reproducir'}
        </Button>
        <p className="tabular-nums text-sm text-slate-600" aria-live="off">
          <span data-testid="practice-current-time">{formatTime(currentTime)}</span>
          {' / '}
          <span data-testid="practice-duration">{formatTime(duration)}</span>
        </p>
      </div>

      <div className="max-w-xl space-y-1">
        <label htmlFor={seekId} className="block text-sm font-medium text-slate-700">
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
          className="w-full accent-primary"
          data-testid="practice-seek"
        />
      </div>

      <div className="max-w-xs space-y-1">
        <label htmlFor={volumeId} className="block text-sm font-medium text-slate-700">
          Volumen
        </label>
        <input
          id={volumeId}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-full accent-primary"
          data-testid="practice-volume"
        />
      </div>
    </section>
  )
}
