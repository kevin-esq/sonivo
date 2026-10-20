import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { formatTime } from '../lib/format'
import { useAudioPlayer } from '../repertoire/AudioPlayerContext'
import { Play, Pause, Volume2, Music2, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useRailPresence } from './railPresence'
import type { CSSProperties } from 'react'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]'

export function PersistentGlobalPlayer() {
  const { currentTrack, isPlaying, progress, duration, volume, togglePlay, seek, setVolume, closeTrack } =
    useAudioPlayer()
  const { t } = useT()
  const { railPresent, railCollapsed, brandTokens } = useRailPresence()
  const railOffset = railPresent ? (railCollapsed ? 'md:left-[4.5rem]' : 'md:left-60') : 'md:left-0'
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))
  const [volumeInput, setVolumeInput] = useState(() => String(Math.round(volumePercent)))
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sonivo_player_collapsed') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('sonivo_player_collapsed', String(collapsed))
    } catch {
      // Storage unavailable; the preference only lives in memory.
    }
  }, [collapsed])

  useEffect(() => {
    setVolumeInput(String(Math.round(volumePercent)))
  }, [volumePercent])

  function updateVolumeInput(value: string) {
    if (!/^\d{0,3}$/.test(value)) return
    setVolumeInput(value)
    if (value === '') return
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) setVolume(parsed / 100)
  }

  function commitVolumeInput() {
    const parsed = Number(volumeInput)
    const normalized = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : volumePercent
    setVolume(normalized / 100)
    setVolumeInput(String(Math.round(normalized)))
  }

  useEffect(() => {
    if (!currentTrack) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (collapsed) {
          closeTrack()
        } else {
          setCollapsed(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentTrack, collapsed, closeTrack])

  if (!currentTrack) return null

  if (collapsed) {
    return (
      <div style={brandTokens as CSSProperties} className={`fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-50 mx-auto flex items-center gap-3 rounded-2xl border border-shell-border bg-shell px-4 py-2 text-shell-foreground shadow-md motion-reduce:transition-none md:inset-x-4 md:bottom-4 md:max-w-6xl md:px-6 ${railOffset}`} data-testid="global-player">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"
          aria-hidden="true"
        >
          <Music2 size={16} />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{currentTrack.title}</p>
        <button
          type="button"
          onClick={togglePlay}
          className={`grid min-h-11 min-w-11 place-items-center rounded-full bg-[var(--brand-primary)] text-[var(--brand-on-primary)] shadow-sm transition-all hover:opacity-90 motion-reduce:transition-none ${focusRing}`}
          aria-label={isPlaying ? t('player.pause') : t('player.play')}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className={`grid min-h-11 min-w-11 place-items-center rounded-lg text-shell-foreground/70 transition-colors hover:bg-shell-hover hover:text-shell-foreground motion-reduce:transition-none ${focusRing}`}
          aria-label={t('player.expand')}
          aria-expanded="false"
        >
          <ChevronUp size={18} />
        </button>
        <button
          type="button"
          onClick={closeTrack}
          className={`grid min-h-11 min-w-11 place-items-center rounded-lg text-shell-foreground/70 transition-colors hover:bg-shell-hover hover:text-shell-foreground motion-reduce:transition-none ${focusRing}`}
          aria-label={t('player.close')}
        >
          <X size={18} />
        </button>
      </div>
    )
  }

  return (
    <div style={brandTokens as CSSProperties} className={`fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-50 mx-auto grid min-h-28 max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-2xl border border-shell-border bg-shell px-4 py-2 text-shell-foreground shadow-md motion-reduce:transition-none md:inset-x-4 md:bottom-4 md:flex md:h-20 md:justify-between md:gap-3 md:px-6 ${railOffset}`} data-testid="global-player">
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 md:w-1/4 md:gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"
          aria-hidden="true"
        >
          <Music2 size={20} />
        </span>
        <div className="hidden min-w-0 truncate sm:block">
          <p className="truncate text-sm font-semibold">{currentTrack.title}</p>
          <p className="truncate text-xs text-shell-foreground/70">{currentTrack.artist || t('player.fallbackArtist')}</p>
        </div>
      </div>

      <div className="col-span-2 row-start-2 flex min-w-0 w-full flex-col items-center gap-1.5 md:w-2/4 md:max-w-xl">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={togglePlay}
            className={`grid min-h-11 min-w-11 place-items-center rounded-full bg-[var(--brand-primary)] p-2.5 text-[var(--brand-on-primary)] shadow-md shadow-primary/30 transition-all hover:opacity-90 motion-reduce:transition-none ${focusRing}`}
            aria-label={isPlaying ? t('player.pause') : t('player.play')}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
        </div>
        <div className="flex w-full items-center gap-3 text-xs text-shell-foreground/70">
          <span>{formatTime(progress)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={progress}
            onChange={(e) => seek(Number(e.target.value))}
          className={`h-1.5 w-full cursor-pointer appearance-none rounded-lg ${focusRing}`}
          style={{
            background: `linear-gradient(to right, var(--brand-primary) ${progressPercent}%, color-mix(in srgb, var(--color-ink) 16%, transparent) ${progressPercent}%)`,
            accentColor: 'var(--brand-primary)',
          }}
          aria-valuetext={`${formatTime(progress)} / ${formatTime(duration)}`}
            aria-label={t('player.progress')}
          />
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 md:w-1/4 md:gap-2">
        <Volume2 size={18} className="hidden text-shell-foreground/70 sm:block" aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className={`hidden h-1.5 w-24 cursor-pointer appearance-none rounded-lg sm:block ${focusRing}`}
          style={{
            background: `linear-gradient(to right, var(--brand-primary) ${volumePercent}%, color-mix(in srgb, var(--color-ink) 16%, transparent) ${volumePercent}%)`,
            accentColor: 'var(--brand-primary)',
          }}
          aria-valuetext={t('player.volumeValue', { percent: String(Math.round(volumePercent)) })}
          aria-label={t('player.volume')}
        />
        <div className="flex items-center gap-0.5 text-xs font-medium tabular-nums text-shell-foreground/75">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{1,3}"
            maxLength={3}
            value={volumeInput}
            onChange={(e) => updateVolumeInput(e.target.value)}
            onBlur={commitVolumeInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="w-8 bg-transparent p-0 text-right text-xs font-medium tabular-nums text-shell-foreground/75 outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            aria-label={t('player.volumePercentage')}
          />
          <span aria-hidden="true">%</span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className={`grid min-h-11 min-w-11 place-items-center rounded-lg text-shell-foreground/70 transition-colors hover:bg-shell-hover hover:text-shell-foreground motion-reduce:transition-none ${focusRing}`}
          aria-label={t('player.collapse')}
          aria-expanded="true"
        >
          <ChevronDown size={18} />
        </button>
        <button
          type="button"
          onClick={closeTrack}
          className={`grid min-h-11 min-w-11 place-items-center rounded-lg text-shell-foreground/70 transition-colors hover:bg-shell-hover hover:text-shell-foreground motion-reduce:transition-none ${focusRing}`}
          aria-label={t('player.close')}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
