import { Music2, Pause, Play, X } from 'lucide-react'
import { useT } from '../i18n'
import { useAudioPlayer } from '../repertoire/AudioPlayerContext'
import { parseYouTubeVideoId } from '../repertoire/youtubeRef'
import { cn } from '../ui/cn'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  const m = Math.floor(whole / 60)
  const s = whole % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Tarjeta "Reproduciendo" del rail. Reutiliza el MISMO `useAudioPlayer()` que
 * la barra inferior: una sola superficie de audio. En rail colapsado degrada a
 * un indicador + play/pausa + cerrar apilados para no desbordar.
 */
export function RailNowPlaying({ collapsed }: { collapsed: boolean }) {
  const { currentTrack, isPlaying, progress, duration, togglePlay, seek, closeTrack } =
    useAudioPlayer()
  const { t } = useT()

  if (!currentTrack) return null

  const artist = currentTrack.artist || t('player.fallbackArtist')
  const videoId = parseYouTubeVideoId(currentTrack.url)
  const indicatorLabel = t('player.nowPlayingLabel', { title: currentTrack.title })

  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center gap-1 border-t border-shell-border px-2 py-3"
        data-testid="rail-now-playing"
      >
        <span
          role="img"
          aria-label={indicatorLabel}
          title={indicatorLabel}
          className="grid h-11 w-11 place-items-center rounded-lg bg-primary/20 text-shell-link"
        >
          <Music2 size={18} aria-hidden="true" />
        </span>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? t('player.pause') : t('player.play')}
          className={cn(
            'grid min-h-11 min-w-11 place-items-center rounded-full bg-primary-strong text-white transition-all hover:opacity-90 motion-reduce:transition-none',
            focusRing,
          )}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <button
          type="button"
          onClick={closeTrack}
          aria-label={t('player.close')}
          className={cn(
            'grid min-h-11 min-w-11 place-items-center rounded-lg text-shell-foreground/70 transition-colors hover:bg-shell-hover hover:text-shell-foreground motion-reduce:transition-none',
            focusRing,
          )}
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="border-t border-shell-border px-3 py-3">
      <div className="space-y-2 rounded-xl bg-shell-hover p-3" data-testid="rail-now-playing">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-shell-foreground/60">
          {t('player.nowPlaying')}
        </p>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={currentTrack.title}>
            <span data-testid="rail-now-playing-title">{currentTrack.title}</span>
          </p>
          <p className="truncate text-xs text-shell-foreground/70">{artist}</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] tabular-nums text-shell-foreground/70">
          <span>{formatTime(progress)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={progress}
            onChange={(event) => seek(Number(event.target.value))}
            className={cn(
              'h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-shell-foreground/15 accent-primary',
              focusRing,
            )}
            aria-label={t('player.progress')}
            data-testid="rail-seek"
          />
          <span>{formatTime(duration)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? t('player.pause') : t('player.play')}
            className={cn(
              'grid min-h-11 min-w-11 place-items-center rounded-full bg-primary-strong text-white transition-all hover:opacity-90 motion-reduce:transition-none',
              focusRing,
            )}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>
          {videoId ? (
            <a
              href={currentTrack.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'min-h-11 truncate rounded-lg px-2 text-xs font-medium text-shell-link no-underline hover:underline',
                focusRing,
              )}
            >
              {t('player.openYouTube')}
            </a>
          ) : null}
          <button
            type="button"
            onClick={closeTrack}
            aria-label={t('player.close')}
            className={cn(
              'ml-auto grid min-h-11 min-w-11 place-items-center rounded-lg text-shell-foreground/70 transition-colors hover:bg-shell-hover hover:text-shell-foreground motion-reduce:transition-none',
              focusRing,
            )}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
