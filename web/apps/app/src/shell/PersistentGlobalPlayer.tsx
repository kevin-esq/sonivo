import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { Play, Pause, Volume2, Maximize2, RotateCcw, RotateCw } from 'lucide-react'
import { useT } from '../i18n'
import { SonivoMark } from '../brand/SonivoMark'
import { useAudioPlayer } from '../repertoire/AudioPlayerContext'
import { cn } from '../ui/cn'
import { useRailPresence } from './railPresence'
import { PlayerSeekControl } from './PlayerSeekControl'
import { NowPlayingOverlay } from './NowPlayingOverlay'

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]'
const control = `grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-shell-hover motion-reduce:transition-none ${focusRing}`

export function PersistentGlobalPlayer() {
  const { currentTrack, isPlaying, progress, seekVersion, duration, volume, getCurrentTime, playTrack, togglePlay, seek, setVolume } = useAudioPlayer()
  const { t } = useT()
  const { brandTokens } = useRailPresence()
  const volumePercent = Math.min(100, Math.max(0, volume * 100))
  const [expanded, setExpanded] = useState(false)
  const [volumeDraft, setVolumeDraft] = useState<string | null>(null)
  const mobileCapsuleRef = useRef<HTMLDivElement>(null)
  const desktopCardRef = useRef<HTMLDivElement>(null)
  const mobileExpandButtonRef = useRef<HTMLButtonElement>(null)
  const desktopExpandButtonRef = useRef<HTMLButtonElement>(null)
  const touchStart = useRef<{ y: number; canExpand: boolean } | null>(null)
  const suppressExpandClick = useRef(false)
  const [swipeProgress, setSwipeProgress] = useState(0)
  const [entryProgress, setEntryProgress] = useState<number | null>(null)
  const [entryFromGesture, setEntryFromGesture] = useState(false)

  const updateProgressAngle = useCallback((time: number) => {
    const angle = `${duration > 0 ? Math.min(100, Math.max(0, time / duration * 100)) * 3.6 : 0}deg`
    mobileCapsuleRef.current?.style.setProperty('--player-progress-angle', angle)
    desktopCardRef.current?.style.setProperty('--player-progress-angle', angle)
  }, [duration])

  useEffect(() => {
    let frame = 0
    const update = () => {
      updateProgressAngle(getCurrentTime())
      if (isPlaying) frame = requestAnimationFrame(update)
    }
    update()
    return () => cancelAnimationFrame(frame)
  }, [currentTrack?.id, currentTrack?.url, getCurrentTime, isPlaying, seekVersion, updateProgressAngle])

  function skip(seconds: number) { seek(Math.min(duration, Math.max(0, progress + seconds))) }
  function expand() {
    setEntryProgress(null)
    setEntryFromGesture(false)
    setExpanded(true)
  }
  function finishExpandGesture() {
    setEntryProgress(1)
    setEntryFromGesture(false)
    setSwipeProgress(0)
  }
  function dismissExpanded() {
    setExpanded(false)
    setEntryProgress(null)
    setEntryFromGesture(false)
    requestAnimationFrame(() => {
      const button = window.matchMedia('(min-width: 768px)').matches
        ? desktopExpandButtonRef.current
        : mobileExpandButtonRef.current
      button?.focus()
    })
  }
  function handleTouchEnd(endY: number) {
    const start = touchStart.current
    const distance = start ? start.y - endY : 0
    if (distance > window.innerHeight * 0.2) {
      suppressExpandClick.current = true
      if (!expanded) finishExpandGesture()
      window.setTimeout(() => { suppressExpandClick.current = false }, 0)
    } else if (distance > 12) {
      dismissExpanded()
    } else if (start?.canExpand && Math.abs(distance) < 8) {
      expand()
    }
    touchStart.current = null
    setSwipeProgress(0)
    setEntryProgress(null)
  }
  function handleTouchStart(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const target = event.target as HTMLElement
    const expandButton = target.closest<HTMLButtonElement>('[data-player-expand]')
    if (!target.closest('.persistent-player__capsule') || target.closest('[data-player-controls], input, a')) return
    touchStart.current = { y: event.clientY, canExpand: Boolean(expandButton) }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function handleTouchMove(endY: number) {
    if (!touchStart.current) return
    const distance = touchStart.current.y - endY
    setSwipeProgress(Math.max(0, distance))
    if (distance > 12) {
      setExpanded(true)
      setEntryFromGesture(true)
      setEntryProgress(Math.max(0, Math.min(1, distance / window.innerHeight)))
    } else if (entryFromGesture) {
      setEntryProgress(Math.max(0, Math.min(1, distance / window.innerHeight)))
    }
  }
  function handleExpandClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (suppressExpandClick.current) {
      suppressExpandClick.current = false
      event.preventDefault()
      return
    }
    expand()
  }

  if (!currentTrack) return null

  return (
    <div style={brandTokens as CSSProperties}
      className={cn('persistent-player fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-4xl text-shell-foreground md:inset-x-auto md:bottom-6 md:right-6 md:mx-0 md:max-w-none', expanded && 'z-[100]')}
      data-testid="global-player" role="region" aria-label={t('player.nowPlayingLabel', { title: currentTrack.title })}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented || !expanded) return
        event.stopPropagation()
        dismissExpanded()
      }}
      onPointerCancel={() => { touchStart.current = null; setSwipeProgress(0); setEntryProgress(null); if (entryFromGesture) dismissExpanded() }}
      onPointerDown={handleTouchStart}
      onPointerMove={(event) => handleTouchMove(event.clientY)}
      onPointerUp={(event) => handleTouchEnd(event.clientY)}
    >
      <div
        ref={mobileCapsuleRef}
        className={cn('persistent-player__capsule grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[1.5rem] border border-shell-border bg-shell/95 p-3 backdrop-blur-xl md:hidden', swipeProgress > 0 && 'persistent-player__capsule--dragging', expanded && 'hidden')}
        style={{ transform: `translate3d(0, -${swipeProgress}px, 0)`, opacity: 1 - Math.min(swipeProgress / 900, 0.22), display: expanded ? 'none' : undefined }}
      >
        <button ref={mobileExpandButtonRef} type="button" data-player-expand onClick={handleExpandClick} aria-label={t('player.openFullscreen')} className="flex min-w-0 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]">
        <span className="player-cover grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl text-[var(--brand-primary)]" aria-hidden="true">
          <SonivoMark className="h-7 w-7 text-current" />
        </span>
        <span className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={currentTrack.title}>{currentTrack.title}</p>
          <p className="truncate text-xs text-shell-foreground/65">{currentTrack.artist || t('player.fallbackArtist')}</p>
        </span>
        </button>
        <div className="hidden min-w-0 items-center justify-self-stretch gap-4 md:flex">
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => skip(-10)} disabled={duration <= 0} className={cn(control, 'hidden disabled:opacity-40 lg:grid')} aria-label={t('player.rewind')} title={t('player.rewind')}><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" onClick={togglePlay} className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--brand-primary)] text-[var(--brand-on-primary)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)] motion-reduce:transition-none', focusRing)} aria-label={isPlaying ? t('player.pause') : t('player.play')}>
              {isPlaying ? <Pause className="h-5 w-5" fill="currentColor" aria-hidden="true" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true" />}
            </button>
            <button type="button" onClick={() => skip(10)} disabled={duration <= 0} className={cn(control, 'hidden disabled:opacity-40 lg:grid')} aria-label={t('player.forward')} title={t('player.forward')}><RotateCw className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <PlayerSeekControl className="min-w-0 flex-1" />
        </div>
        <div data-player-controls className="flex shrink-0 items-center justify-end gap-1 md:gap-2">
          <button type="button" onClick={() => skip(-10)} disabled={duration <= 0} className={cn(control, 'md:hidden disabled:opacity-40')} aria-label={t('player.rewind')} title={t('player.rewind')}><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" onClick={togglePlay} className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--brand-primary)] text-[var(--brand-on-primary)] transition-colors hover:bg-[var(--brand-primary-strong,var(--brand-primary))] motion-reduce:transition-none md:hidden', focusRing)} aria-label={isPlaying ? t('player.pause') : t('player.play')}>
            {isPlaying ? <Pause className="h-5 w-5" fill="currentColor" aria-hidden="true" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => skip(10)} disabled={duration <= 0} className={cn(control, 'md:hidden disabled:opacity-40')} aria-label={t('player.forward')} title={t('player.forward')}><RotateCw className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" onClick={expand} className={cn(control, 'hidden md:grid')} aria-label={t('player.openFullscreen')} title={t('player.openFullscreen')}>
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <label className="hidden items-center gap-2 lg:flex" aria-label={t('player.volume')}>
            <Volume2 className="h-4 w-4 text-shell-foreground/65" aria-hidden="true" />
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="persistent-player__range w-24" style={{ '--player-fill': `${volumePercent}%` } as CSSProperties} aria-valuetext={t('player.volumeValue', { percent: String(Math.round(volumePercent)) })} aria-label={t('player.volume')} />
          </label>
        </div>
      </div>
      <div
        ref={desktopCardRef}
        className={cn(
          'persistent-player__desktop-card hidden grid-cols-[4rem_minmax(0,1fr)_auto_4.5rem] grid-rows-[3.5rem_3rem] items-center gap-x-3 gap-y-1 rounded-[1.5rem] border border-shell-border bg-shell/95 p-4 text-shell-foreground backdrop-blur-xl md:grid',
          swipeProgress > 0 && 'persistent-player__capsule--dragging',
          expanded && 'hidden',
        )}
        style={{ display: expanded ? 'none' : undefined, width: 'min(calc(100vw - 3rem), 34rem)' }}
        data-player-controls
      >
        <button
          type="button"
          data-player-expand
          onClick={expand}
          aria-label={t('player.openFullscreen')}
          className="player-cover col-start-1 row-start-1 row-span-2 grid h-16 w-16 place-items-center overflow-hidden rounded-xl border border-shell-border/70 text-[var(--brand-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]"
        >
          <SonivoMark className="h-8 w-8 text-current" aria-hidden="true" />
        </button>
        <button type="button" data-player-expand onClick={expand} aria-label={t('player.openFullscreen')} className="col-start-2 row-start-1 flex min-h-12 min-w-0 items-center text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]">
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold" title={currentTrack.title}>{currentTrack.title}</span>
            <span className="block truncate text-sm text-shell-foreground/65">{currentTrack.artist || t('player.fallbackArtist')}</span>
          </span>
        </button>
        <div className="col-start-3 row-start-1 row-span-2 flex h-full shrink-0 items-center justify-end gap-1">
          <button type="button" onClick={() => skip(-10)} disabled={duration <= 0} className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-shell-hover disabled:opacity-40', focusRing)} aria-label={t('player.rewind')} title={t('player.rewind')}><RotateCcw className="h-5 w-5" aria-hidden="true" /></button>
          <button type="button" onClick={togglePlay} className={cn('grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--brand-primary)] text-[var(--brand-on-primary)] transition-transform hover:scale-105 motion-reduce:transition-none', focusRing)} aria-label={isPlaying ? t('player.pause') : t('player.play')}>
            {isPlaying ? <Pause className="h-6 w-6" fill="currentColor" aria-hidden="true" /> : <Play className="ml-0.5 h-6 w-6" fill="currentColor" aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => skip(10)} disabled={duration <= 0} className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-shell-hover disabled:opacity-40', focusRing)} aria-label={t('player.forward')} title={t('player.forward')}><RotateCw className="h-5 w-5" aria-hidden="true" /></button>
          <button ref={desktopExpandButtonRef} type="button" onClick={expand} className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-shell-hover', focusRing)} aria-label={t('player.openFullscreen')} title={t('player.openFullscreen')}>
            <Maximize2 className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <PlayerSeekControl className="col-start-2 row-start-2 min-w-0" />
        <label className="col-start-4 row-start-1 row-span-2 flex h-full flex-col items-center justify-between border-l border-shell-border py-1 pl-3" aria-label={t('player.volume')}>
          <span className="flex items-center gap-0.5 text-shell-foreground/80">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              value={volumeDraft ?? String(Math.round(volumePercent))}
              onChange={(event) => setVolumeDraft(event.target.value)}
              onBlur={() => {
                if (volumeDraft == null) return
                const next = Number(volumeDraft)
                if (volumeDraft.trim() && Number.isFinite(next)) setVolume(Math.min(100, Math.max(0, next)) / 100)
                setVolumeDraft(null)
              }}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
              className="persistent-player__volume-input w-12 appearance-none bg-transparent text-right text-[0.65rem] font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand-primary)]"
              aria-label={t('player.volumePercentage')}
            />
            <span className="text-[0.65rem] font-semibold" aria-hidden="true">%</span>
          </span>
          <span className="flex min-h-0 flex-1 w-9 items-center justify-center rounded-full bg-shell-foreground/10">
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="persistent-player__range persistent-player__range--vertical" style={{ '--player-fill': `${volumePercent}%` } as CSSProperties} aria-valuetext={t('player.volumeValue', { percent: String(Math.round(volumePercent)) })} aria-label={t('player.volume')} />
          </span>
          <Volume2 className="h-4 w-4 shrink-0 text-shell-foreground/75" aria-hidden="true" />
        </label>
      </div>
      {expanded ? (
        <NowPlayingOverlay
          track={currentTrack}
          isPlaying={isPlaying}
          progress={progress}
          duration={duration}
          volume={volume}
          onDismiss={dismissExpanded}
          onTogglePlay={togglePlay}
          onSeek={seek}
          onVolumeChange={setVolume}
          onSelectTrack={playTrack}
          entryProgress={entryProgress}
          entryFromGesture={entryFromGesture}
        />
      ) : null}
    </div>
  )
}
