import type { CSSProperties } from 'react'
import { useT } from '../i18n'
import { formatTime } from '../lib/format'
import { useAudioPlayer } from '../repertoire/AudioPlayerContext'
import { cn } from '../ui/cn'

// A Sonivo sound mark; the highlighted portion represents playback progress.
const heights = [2, 3, 5, 3, 8, 13, 8, 18, 28, 19, 10, 6, 12, 7, 3, 5, 8, 16, 23, 15, 9, 4, 6, 3, 2]
const soundMark = heights.map((height, index) => `M${index * 5 + 2} ${16 - height / 2}v${height}`).join(' ')

export function PlayerSeekControl({ waveform = false, className }: { waveform?: boolean; className?: string }) {
  const { t } = useT()
  const { progress, duration, seek } = useAudioPlayer()
  const percent = duration > 0 ? Math.min(100, Math.max(0, progress / duration * 100)) : 0
  return (
    <div className={cn('min-w-0', className)} style={{ '--player-fill': `${percent}%` } as CSSProperties}>
      <div className={cn('relative flex h-11 items-center rounded-lg', waveform && 'persistent-player__wave-control')}>
        {waveform ? (
          <svg viewBox="0 0 124 32" className="h-8 w-full" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d={soundMark} className="stroke-shell-foreground/30" />
            <path d={soundMark} className="persistent-player__wave-played" />
          </svg>
        ) : null}
        <input
          type="range" min={0} max={duration || 100} step={0.1} value={Math.min(progress, duration || 0)}
          disabled={duration <= 0}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label={t('player.progress')}
          aria-valuetext={`${formatTime(progress)} / ${formatTime(duration)}`}
          className={waveform ? 'absolute inset-0 h-11 w-full cursor-pointer opacity-0 disabled:cursor-default' : 'persistent-player__range w-full'}
        />
      </div>
      <div className="flex justify-between gap-2 text-[10px] font-medium tabular-nums opacity-75" aria-hidden="true">
        <span>{formatTime(progress)}</span><span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}
