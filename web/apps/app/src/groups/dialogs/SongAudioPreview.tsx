import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { useT } from '../../i18n'
import { cn } from '../../ui/cn'

type SongAudioPreviewProps = {
  file: File
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function SongAudioPreview({ file }: SongAudioPreviewProps) {
  const { t } = useT()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    let cancelled = false
    setSrc(url)
    setPeaks(null)
    setDuration(0)
    setPosition(0)
    setPlaying(false)

    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) return () => URL.revokeObjectURL(url)

    const context = new AudioCtor()
    void file.arrayBuffer()
      .then((buffer) => context.decodeAudioData(buffer))
      .then((decoded) => {
        if (cancelled) return
        const channel = decoded.getChannelData(0)
        const count = 96
        const block = Math.max(1, Math.floor(channel.length / count))
        setPeaks(Array.from({ length: count }, (_, index) => {
          let peak = 0
          const start = index * block
          for (let sample = start; sample < start + block; sample += 1) peak = Math.max(peak, Math.abs(channel[sample] ?? 0))
          return Math.max(6, Math.round(peak * 100))
        }))
      })
      .catch(() => {
        if (!cancelled) setPeaks([])
      })
      .finally(() => void context.close().catch(() => undefined))

    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
      void context.close().catch(() => undefined)
    }
  }, [file])

  function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play().catch(() => undefined)
    else audio.pause()
  }

  function seek(value: number) {
    setPosition(value)
    if (audioRef.current && Number.isFinite(value)) audioRef.current.currentTime = value
  }

  return (
    <div className="space-y-3 rounded-xl border border-border-subtle bg-surface-hover/50 p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={playing ? t('songCreate.wizardPausePreview') : t('songCreate.wizardPlayPreview')}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-strong text-primary-foreground transition hover:bg-primary-strong/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {playing ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
        </button>
        <span className="text-xs tabular-nums text-muted">{formatDuration(position)} / {formatDuration(duration)}</span>
      </div>
      <div className="relative h-12 w-full overflow-hidden rounded-lg bg-surface-hover px-1 focus-within:ring-2 focus-within:ring-primary">
        <div className="pointer-events-none absolute inset-0 flex items-center gap-[2px] px-1" aria-hidden="true">
          {(peaks ?? Array.from({ length: 96 }, () => 8)).map((height, index) => (
            <span key={index} className={cn('min-w-0 flex-1 rounded-full', duration > 0 && index / (peaks?.length ?? 96) <= position / duration ? 'bg-primary' : 'bg-primary/35')} style={{ height: `${height}%` }} />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.05}
          value={duration ? Math.min(position, duration) : 0}
          disabled={!duration}
          aria-label={t('songCreate.wizardSeekAudio')}
          aria-valuetext={`${formatDuration(position)} / ${formatDuration(duration)}`}
          onChange={(event) => seek(Number(event.currentTarget.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
        />
      </div>
      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); seek(0) }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        className="sr-only"
      />
    </div>
  )
}
