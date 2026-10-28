import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Play, Pause, Volume2, ChevronDown, ChevronUp, MoreHorizontal, RotateCcw, RotateCw, X } from 'lucide-react'
import { useT } from '../i18n'
import { SonivoMark } from '../brand/SonivoMark'
import { useAudioPlayer } from '../repertoire/AudioPlayerContext'
import { cn } from '../ui/cn'
import { useRailPresence } from './railPresence'
import { PlayerSeekControl } from './PlayerSeekControl'

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]'
const control = `grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-shell-hover motion-reduce:transition-none ${focusRing}`

export function PersistentGlobalPlayer() {
  const { currentTrack, isPlaying, progress, duration, volume, togglePlay, seek, setVolume, closeTrack } = useAudioPlayer()
  const { t } = useT()
  const { railPresent, railCollapsed, brandTokens } = useRailPresence()
  const railOffset = railPresent ? (railCollapsed ? 'md:left-[calc(4.5rem+1rem)]' : 'md:left-[calc(15rem+1rem)]') : 'md:left-4'
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, progress / duration * 100)) : 0
  const volumePercent = Math.min(100, Math.max(0, volume * 100))
  const [volumeInput, setVolumeInput] = useState(() => String(Math.round(volumePercent)))
  const [optionsOpen, setOptionsOpen] = useState(false)
  const playerRef = useRef<HTMLDivElement>(null)
  const optionsButtonRef = useRef<HTMLButtonElement>(null)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sonivo_player_collapsed') === 'true' }
    catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem('sonivo_player_collapsed', String(collapsed)) }
    catch { /* Keep the preference in memory when storage is unavailable. */ }
  }, [collapsed])
  useEffect(() => setVolumeInput(String(Math.round(volumePercent))), [volumePercent])
  useEffect(() => {
    if (!optionsOpen) return
    function dismiss(event: PointerEvent) {
      if (!playerRef.current?.contains(event.target as Node)) setOptionsOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [optionsOpen])

  function updateVolumeInput(value: string) {
    if (!/^\d{0,3}$/.test(value)) return
    setVolumeInput(value)
    if (value === '') return
    const parsed = Number(value)
    if (parsed >= 0 && parsed <= 100) setVolume(parsed / 100)
  }
  function commitVolumeInput() {
    const parsed = Number(volumeInput)
    const normalized = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : volumePercent
    setVolume(normalized / 100)
    setVolumeInput(String(Math.round(normalized)))
  }
  function skip(seconds: number) { seek(Math.min(duration, Math.max(0, progress + seconds))) }
  function collapse() { setOptionsOpen(false); setCollapsed(true) }

  if (!currentTrack) return null

  return (
    <div ref={playerRef} style={brandTokens as CSSProperties}
      className={cn('persistent-player fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-4xl text-shell-foreground md:right-4 md:bottom-4', railOffset)}
      data-testid="global-player" role="region" aria-label={t('player.nowPlayingLabel', { title: currentTrack.title })}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.stopPropagation()
        if (optionsOpen) { setOptionsOpen(false); optionsButtonRef.current?.focus() }
        else if (!collapsed) collapse()
        else closeTrack()
      }}
    >
      {optionsOpen && !collapsed ? (
        <div id="global-player-options" role="group" aria-label={t('player.controls')} className="mb-3 space-y-2 rounded-2xl border border-border-subtle bg-surface p-4 text-ink shadow-xl">
          <div className="flex items-center gap-3 md:hidden">
            <button type="button" onClick={() => skip(-10)} disabled={duration <= 0} className={cn(control, 'disabled:opacity-40')} aria-label={t('player.rewind')} title={t('player.rewind')}><RotateCcw className="h-5 w-5" aria-hidden="true" /></button>
            <PlayerSeekControl className="flex-1" />
            <button type="button" onClick={() => skip(10)} disabled={duration <= 0} className={cn(control, 'disabled:opacity-40')} aria-label={t('player.forward')} title={t('player.forward')}><RotateCw className="h-5 w-5" aria-hidden="true" /></button>
          </div>
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(event) => setVolume(Number(event.target.value))}
              className="persistent-player__range min-w-0 flex-1" style={{ '--player-fill': `${volumePercent}%` } as CSSProperties}
              aria-valuetext={t('player.volumeValue', { percent: String(Math.round(volumePercent)) })} aria-label={t('player.volume')} />
            <div className="flex shrink-0 items-center text-xs tabular-nums text-muted">
              <input type="text" inputMode="numeric" pattern="[0-9]{1,3}" maxLength={3} value={volumeInput}
                onChange={(event) => updateVolumeInput(event.target.value)} onBlur={commitVolumeInput}
                onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
                className={cn('h-11 w-11 rounded-lg bg-transparent text-center text-sm text-ink', focusRing)} aria-label={t('player.volumePercentage')} />
              <span aria-hidden="true">%</span>
            </div>
            <button type="button" onClick={collapse} className={control} aria-label={t('player.collapse')} aria-expanded="true"><ChevronDown className="h-5 w-5" aria-hidden="true" /></button>
            <button type="button" onClick={closeTrack} className={control} aria-label={t('player.close')}><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>
        </div>
      ) : null}
      <div className="persistent-player__capsule flex min-h-20 items-center gap-3 rounded-[2rem] border border-shell-border bg-shell/95 p-3 backdrop-blur-xl md:gap-5 md:px-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--brand-primary-soft)] text-[var(--brand-primary-ink,var(--brand-primary))] md:h-12 md:w-12" aria-hidden="true">
          <SonivoMark className="h-8 w-8 text-current" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-semibold" title={currentTrack.title}>{currentTrack.title}</p>
          <p className="truncate text-[11px] text-shell-foreground/75">{currentTrack.artist || t('player.fallbackArtist')}</p>
          <div className="h-0.5 overflow-hidden rounded-full bg-shell-foreground/15" aria-hidden="true">
            <div className="h-full origin-left bg-[var(--brand-primary)]" style={{ transform: `scaleX(${progressPercent / 100})` }} />
          </div>
        </div>
        {!collapsed ? <PlayerSeekControl waveform className="hidden w-24 shrink-0 text-shell-foreground md:block lg:w-28 xl:w-36" /> : null}
        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          {!collapsed ? <button type="button" onClick={() => skip(-10)} disabled={duration <= 0} className={cn(control, 'hidden border border-shell-border disabled:opacity-40 md:grid')} aria-label={t('player.rewind')} title={t('player.rewind')}><RotateCcw className="h-4 w-4" aria-hidden="true" /></button> : null}
          <button type="button" onClick={togglePlay} className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--brand-primary)] text-[var(--brand-on-primary)] transition-colors hover:bg-[var(--brand-primary-strong,var(--brand-primary))] motion-reduce:transition-none', focusRing)} aria-label={isPlaying ? t('player.pause') : t('player.play')}>
            {isPlaying ? <Pause className="h-5 w-5" fill="currentColor" aria-hidden="true" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true" />}
          </button>
          {!collapsed ? <button type="button" onClick={() => skip(10)} disabled={duration <= 0} className={cn(control, 'hidden border border-shell-border disabled:opacity-40 md:grid')} aria-label={t('player.forward')} title={t('player.forward')}><RotateCw className="h-4 w-4" aria-hidden="true" /></button> : null}
          {collapsed ? (
            <>
              <button type="button" onClick={() => setCollapsed(false)} className={control} aria-label={t('player.expand')} aria-expanded="false"><ChevronUp className="h-5 w-5" aria-hidden="true" /></button>
              <button type="button" onClick={closeTrack} className={control} aria-label={t('player.close')}><X className="h-5 w-5" aria-hidden="true" /></button>
            </>
          ) : (
            <button ref={optionsButtonRef} type="button" onClick={() => setOptionsOpen((value) => !value)} className={cn(control, optionsOpen && 'bg-shell-hover')} aria-label={t('player.controls')} aria-expanded={optionsOpen} aria-controls="global-player-options"><MoreHorizontal className="h-5 w-5" aria-hidden="true" /></button>
          )}
        </div>
      </div>
    </div>
  )
}
