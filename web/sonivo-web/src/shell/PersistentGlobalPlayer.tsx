import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { useAudioPlayer } from '../repertoire/AudioPlayerContext'
import { Play, Pause, Volume2, Music2, ChevronDown, ChevronUp, X } from 'lucide-react'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary'

export function PersistentGlobalPlayer() {
  const { currentTrack, isPlaying, progress, duration, volume, togglePlay, seek, setVolume, closeTrack } =
    useAudioPlayer()
  const { t } = useT()
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
      // Almacenamiento no disponible; la preferencia solo vive en memoria.
    }
  }, [collapsed])

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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  if (collapsed) {
    return (
      <div className="fixed inset-x-0 bottom-16 z-50 flex items-center gap-3 border-t border-white/10 bg-neutral-dark/95 px-4 py-2 text-white shadow-2xl backdrop-blur-md motion-reduce:transition-none md:bottom-0 md:px-6">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-secondary"
          aria-hidden="true"
        >
          <Music2 size={16} />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{currentTrack.title}</p>
        <button
          type="button"
          onClick={togglePlay}
          className={`grid min-h-11 min-w-11 place-items-center rounded-full text-white transition-all hover:opacity-90 motion-reduce:transition-none ${focusRing}`}
          aria-label={isPlaying ? t('player.pause') : t('player.play')}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className={`grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white motion-reduce:transition-none ${focusRing}`}
          aria-label={t('player.expand')}
          aria-expanded="false"
        >
          <ChevronUp size={18} />
        </button>
        <button
          type="button"
          onClick={closeTrack}
          className={`grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white motion-reduce:transition-none ${focusRing}`}
          aria-label={t('player.close')}
        >
          <X size={18} />
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-16 z-50 flex h-20 items-center justify-between gap-3 border-t border-white/10 bg-neutral-dark/95 px-4 text-white shadow-2xl backdrop-blur-md motion-reduce:transition-none md:bottom-0 md:px-6">
      <div className="flex w-1/4 min-w-0 items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-secondary"
          aria-hidden="true"
        >
          <Music2 size={20} />
        </span>
        <div className="hidden min-w-0 truncate sm:block">
          <p className="truncate text-sm font-semibold">{currentTrack.title}</p>
          <p className="truncate text-xs text-slate-400">{currentTrack.artist || t('player.fallbackArtist')}</p>
        </div>
      </div>

      <div className="flex w-2/4 max-w-xl flex-col items-center gap-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={togglePlay}
            className={`grid min-h-11 min-w-11 place-items-center rounded-full bg-primary p-2.5 text-white shadow-md shadow-primary/30 transition-all hover:opacity-90 motion-reduce:transition-none ${focusRing}`}
            aria-label={isPlaying ? t('player.pause') : t('player.play')}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
        </div>
        <div className="flex w-full items-center gap-3 text-xs text-slate-400">
          <span>{formatTime(progress)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={progress}
            onChange={(e) => seek(Number(e.target.value))}
            className={`h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/15 accent-primary ${focusRing}`}
            aria-label={t('player.progress')}
          />
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex w-1/4 items-center justify-end gap-1 sm:gap-2">
        <Volume2 size={18} className="hidden text-slate-400 sm:block" aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className={`hidden h-1.5 w-24 cursor-pointer appearance-none rounded-lg bg-white/15 accent-primary sm:block ${focusRing}`}
          aria-label={t('player.volume')}
        />
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className={`grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white motion-reduce:transition-none ${focusRing}`}
          aria-label={t('player.collapse')}
          aria-expanded="true"
        >
          <ChevronDown size={18} />
        </button>
        <button
          type="button"
          onClick={closeTrack}
          className={`grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white motion-reduce:transition-none ${focusRing}`}
          aria-label={t('player.close')}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
