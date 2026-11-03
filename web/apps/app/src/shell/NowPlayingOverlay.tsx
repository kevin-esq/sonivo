'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { AudioLines, Bookmark, BookmarkPlus, Captions, Check, ChevronDown, Heart, ListMusic, Maximize2, Pause, Pencil, Play, RotateCcw, RotateCw, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import type { Track } from '../repertoire/AudioPlayerContext'
import { EMPTY_CHORD_TIMELINE, fillWordTimingGapsForDisplay, isBackingVocalVisible } from '../repertoire/chordTiming'
import { backingVocalParentLineIndex, isBackingVocalLine, parseChordPro } from '../repertoire/chordPro'
import { useAudioPlayer } from '../repertoire/AudioPlayerContext'
import { SyncedLyricText } from '../repertoire/SyncedLyricText'
import { useLyricPlayback } from '../repertoire/useLyricPlayback'
import { emptyPracticeLocalData, readPracticeLocalData, writePracticeLocalData, type PracticeBookmark, type PracticeLocalData } from '../repertoire/practiceLocalData'
import { useT } from '../i18n'
import { SonivoMark } from '../brand/SonivoMark'
import { cn } from '../ui/cn'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

const control = 'grid h-12 w-12 shrink-0 place-items-center rounded-full text-shell-foreground transition-colors hover:bg-shell-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)] motion-reduce:transition-none'

export function NowPlayingOverlay({
  track,
  isPlaying,
  progress,
  duration,
  volume,
  onDismiss,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onSelectTrack,
  entryProgress,
  entryFromGesture,
}: {
  track: Track
  isPlaying: boolean
  progress: number
  duration: number
  volume: number
  onDismiss: () => void
  onTogglePlay: () => void
  onSeek: (seconds: number) => void
  onVolumeChange: (volume: number) => void
  onSelectTrack: (track: Track) => void
  entryProgress: number | null
  entryFromGesture: boolean
}) {
  const { t } = useT()
  const { getCurrentTime, seekVersion } = useAudioPlayer()
  const onSeekRef = useRef(onSeek)
  onSeekRef.current = onSeek
  const seekFromLyrics = useCallback((seconds: number) => onSeekRef.current(seconds), [])
  const lyricWordLabel = useCallback((seconds: number) => t('player.seekLyric', { time: formatTime(seconds) }), [t])
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const [swipeDistance, setSwipeDistance] = useState(0)
  const entrance = useRef<Animation | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const activeLineRef = useRef<HTMLDivElement>(null)
  const [localData, setLocalData] = useState<PracticeLocalData>(emptyPracticeLocalData)
  const [activePanel, setActivePanel] = useState<'audio' | 'bookmarks' | 'lyrics' | null>(null)
  const [manualLyricsScroll, setManualLyricsScroll] = useState(false)
  const [wideLayout, setWideLayout] = useState(true)
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null)
  const [bookmarkDraft, setBookmarkDraft] = useState('')
  const canSaveLocally = Boolean(track.userId && track.groupId && track.songId)
  const bookmarks = localData.bookmarksByTrack[track.id] ?? []
  const liked = localData.likedTrackIds.includes(track.id)
  const lyricsLines = useMemo(() => track.lyrics?.trim() ? parseChordPro(track.lyrics).lines : [], [track.lyrics])
  const sourceLyricTimeline = track.timingTimeline ?? EMPTY_CHORD_TIMELINE
  const displayWordMarks = useMemo(() => fillWordTimingGapsForDisplay(sourceLyricTimeline.wordMarks), [sourceLyricTimeline.wordMarks])
  const lyricTimeline = useMemo(() => displayWordMarks === sourceLyricTimeline.wordMarks
    ? sourceLyricTimeline
    : { ...sourceLyricTimeline, wordMarks: displayWordMarks }, [displayWordMarks, sourceLyricTimeline])
  const lyricPlayback = useLyricPlayback({
    timeline: lyricTimeline,
    isPlaying,
    enabled: wideLayout || activePanel === 'lyrics',
    fallbackMs: progress * 1000,
    seekVersion,
    getCurrentTime,
  })
  const activeLines = lyricPlayback.activeLines
  const wordPresentation = lyricPlayback.wordPresentation
  const activeWord = wordPresentation.active[0] ?? null
  const completedWords = wordPresentation.completed
  const activeLineIndex = activeWord?.lineIndex ?? activeLines[activeLines.length - 1] ?? -1
  const focusLineIndex = activeLineIndex
  const hasLyrics = lyricsLines.some((line) => line.kind === 'lyric')
  const hasMarks = sourceLyricTimeline.lineMarks.length > 0 || displayWordMarks.length > 0 || sourceLyricTimeline.instrumentals.length > 0
  const updateLyricsDepth = useCallback(() => {
    if (!sheetRef.current) return
    for (const panel of sheetRef.current.querySelectorAll<HTMLElement>('[data-player-lyrics-scrollable]')) {
      const rows = Array.from(panel.querySelectorAll<HTMLElement>('[data-lyric-line-row]'))
        .filter(row => row.getBoundingClientRect().height > 0)
      const focused = rows.find(row => row.dataset.active === 'true') ?? rows.find(row => row.dataset.lyricLineRow === String(focusLineIndex))
      const focusBounds = focused?.getBoundingClientRect()
      if (!focusBounds) {
        for (const row of rows) {
          row.style.setProperty('--lyric-line-opacity', hasMarks ? '0.86' : '1')
          row.style.setProperty('--lyric-line-blur', hasMarks ? '2.7px' : '0px')
        }
        continue
      }
      const focusCenter = (focusBounds.top + focusBounds.bottom) / 2
      const step = rows
        .filter(row => row !== focused)
        .map(row => Math.abs((row.getBoundingClientRect().top + row.getBoundingClientRect().bottom) / 2 - focusCenter))
        .filter(distance => distance > 0)
        .sort((left, right) => left - right)[0] ?? Math.max(focusBounds.height, 1)
      for (const row of rows) {
        if (!hasMarks || row.dataset.active === 'true') {
          row.style.setProperty('--lyric-line-opacity', '1')
          row.style.setProperty('--lyric-line-blur', '0px')
          continue
        }
        const bounds = row.getBoundingClientRect()
        const distance = Math.abs((bounds.top + bounds.bottom) / 2 - focusCenter) / step
        const depth = Math.min(1, distance / 4)
        row.style.setProperty('--lyric-line-opacity', String(1 - depth * 0.3))
        row.style.setProperty('--lyric-line-blur', `${depth * 6}px`)
      }
    }
  }, [focusLineIndex, hasMarks])
  const audioOptions = track.audioOptions?.length
    ? track.audioOptions
    : [{ id: track.id, title: track.title, url: track.url }]

  useEffect(() => {
    if (!track.userId || !track.groupId || !track.songId) {
      setLocalData(emptyPracticeLocalData())
      return
    }
    setLocalData(readPracticeLocalData(track.userId, track.groupId, track.songId))
  }, [track.userId, track.groupId, track.songId])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  useLayoutEffect(() => {
    if (entryFromGesture) return
    const player = sheetRef.current
    if (!player || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    entrance.current = player.animate(
      [{ transform: 'translate3d(0, 100%, 0)', opacity: 0.9 }, { transform: 'translate3d(0, 0, 0)', opacity: 1 }],
      { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
    entrance.current.onfinish = () => entrance.current?.cancel()
    return () => entrance.current?.cancel()
  }, [entryFromGesture])

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)')
    const update = () => setWideLayout(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const containers = Array.from(document.querySelectorAll<HTMLElement>('[data-player-lyrics-scrollable]'))
    const pauseFollow = () => setManualLyricsScroll(true)
    let frame = 0
    const updateDepth = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateLyricsDepth)
    }
    for (const container of containers) {
      container.addEventListener('wheel', pauseFollow, { passive: true })
      container.addEventListener('touchstart', pauseFollow, { passive: true })
      container.addEventListener('pointerdown', pauseFollow, { passive: true })
      container.addEventListener('scroll', updateDepth, { passive: true })
    }
    updateDepth()
    return () => {
      cancelAnimationFrame(frame)
      for (const container of containers) {
        container.removeEventListener('wheel', pauseFollow)
        container.removeEventListener('touchstart', pauseFollow)
        container.removeEventListener('pointerdown', pauseFollow)
        container.removeEventListener('scroll', updateDepth)
      }
    }
  }, [activePanel, wideLayout, updateLyricsDepth])

  useLayoutEffect(() => {
    updateLyricsDepth()
  }, [updateLyricsDepth, lyricsLines])

  useEffect(() => {
    if (manualLyricsScroll || activeLineIndex < 0 || !activeLineRef.current) return
    const line = activeLineRef.current
    const container = line.closest<HTMLElement>('[data-player-scrollable]')
    if (!container) return
    const lineRect = line.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const top = container.scrollTop + lineRect.top - containerRect.top - (container.clientHeight - lineRect.height) / 2
    container.scrollTo({
      top,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }, [activeLineIndex, manualLyricsScroll])

  function save(next: PracticeLocalData) {
    if (!track.userId || !track.groupId || !track.songId) return
    setLocalData(next)
    writePracticeLocalData(track.userId, track.groupId, track.songId, next)
  }

  function dismissWithAnimation() {
    const player = sheetRef.current
    if (!player || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onDismiss(); return }
    const transform = getComputedStyle(player).transform
    const opacity = getComputedStyle(player).opacity
    entrance.current?.cancel()
    entrance.current = player.animate(
      [{ transform, opacity }, { transform: 'translate3d(0, 100%, 0)', opacity: 0.9 }],
      { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
    entrance.current.onfinish = onDismiss
  }

  function toggleLike() {
    if (!canSaveLocally) return
    const likedTrackIds = liked
      ? localData.likedTrackIds.filter((id) => id !== track.id)
      : [...localData.likedTrackIds, track.id]
    save({ ...localData, likedTrackIds })
  }

  function addBookmark() {
    if (!canSaveLocally) return
    const next: PracticeBookmark = {
      id: crypto.randomUUID(),
      time: Math.max(0, progress),
      label: t('player.bookmarkDefault', { number: bookmarks.length + 1 }),
    }
    save({ ...localData, bookmarksByTrack: { ...localData.bookmarksByTrack, [track.id]: [...bookmarks, next] } })
  }

  function removeBookmark(id: string) {
    const next = bookmarks.filter((bookmark) => bookmark.id !== id)
    const bookmarksByTrack = { ...localData.bookmarksByTrack }
    if (next.length) bookmarksByTrack[track.id] = next
    else delete bookmarksByTrack[track.id]
    save({ ...localData, bookmarksByTrack })
  }

  function saveBookmarkName(id: string) {
    const label = bookmarkDraft.trim()
    if (!label) return
    const bookmarksByTrack = { ...localData.bookmarksByTrack, [track.id]: bookmarks.map((bookmark) => bookmark.id === id ? { ...bookmark, label } : bookmark) }
    save({ ...localData, bookmarksByTrack })
    setEditingBookmarkId(null)
  }

  function handleSwipeStart(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, textarea, select, [data-player-scrollable]')) {
      swipeStart.current = null
      return
    }
    entrance.current?.cancel()
    swipeStart.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleSwipeMove(event: PointerEvent<HTMLElement>) {
    const start = swipeStart.current
    if (!start) return
    const deltaY = event.clientY - start.y
    if (deltaY > 0 && deltaY > Math.abs(event.clientX - start.x)) setSwipeDistance(deltaY)
  }

  function handleSwipeEnd(event: PointerEvent<HTMLElement>) {
    const start = swipeStart.current
    const deltaY = start ? event.clientY - start.y : 0
    if (deltaY > 96 && deltaY > Math.abs(event.clientX - (start?.x ?? event.clientX))) onDismiss()
    swipeStart.current = null
    setSwipeDistance(0)
  }

  function selectAudio(option: (typeof audioOptions)[number]) {
    if (option.id !== track.id) onSelectTrack({ ...track, id: option.id, title: option.title, url: option.url })
    setActivePanel(null)
  }

  function renderPanelContent() {
    if (activePanel === 'audio') return (
      <div className="space-y-2 overflow-y-auto" aria-label={t('player.audioFiles')}>
        <p className="pb-1 text-sm text-shell-foreground/65">{t('player.audioFilesHint')}</p>
        {audioOptions.map((option) => (
          <button key={option.id} type="button" onClick={() => selectAudio(option)} aria-current={option.id === track.id ? 'true' : undefined} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-shell-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]">
            <AudioLines className="h-5 w-5 shrink-0 text-shell-foreground/70" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{option.title}{option.arrangementLabel ? <span className="ml-2 text-shell-foreground/60">{option.arrangementLabel}</span> : null}</span>
            {option.id === track.id ? <Check className="h-4 w-4 shrink-0 text-[var(--brand-primary)]" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
    )
    if (activePanel === 'bookmarks') return <div className="overflow-y-auto">{renderBookmarks()}</div>
    if (activePanel === 'lyrics') return <div className="overflow-y-auto">{renderLyrics()}</div>
    return null
  }

  function renderLyrics() {
    if (!hasLyrics) return <p className="mx-auto max-w-sm py-12 text-center text-sm text-shell-foreground/70">{t('player.lyricsMissing')}</p>

    return lyricsLines.map((line, lineIndex) => {
      if (line.kind === 'empty') return <div key={`empty-${lineIndex}`} className="h-5" aria-hidden="true" />
      if (line.kind !== 'lyric') return null
      const lineText = line.segments.map((segment) => segment.lyric).join('')
      if (!lineText.trim()) return <div key={`empty-${lineIndex}`} className="h-5" aria-hidden="true" />
      const mark = track.timingTimeline?.lineMarks.find((item) => item.lineIndex === lineIndex)
      const backing = isBackingVocalLine(line)
      const parentLineIndex = backing ? backingVocalParentLineIndex(lyricsLines, lineIndex) : null
      const ownMarks = sourceLyricTimeline.lineMarks.some(item => item.lineIndex === lineIndex) || displayWordMarks.some(item => item.lineIndex === lineIndex)
      const backingVisible = !backing || isBackingVocalVisible(lineIndex, parentLineIndex, activeLines, ownMarks, !manualLyricsScroll, hasMarks)
      const parentActive = backing && !ownMarks && parentLineIndex != null && activeLines.includes(parentLineIndex)
      const active = activeLines.includes(lineIndex) || activeWord?.lineIndex === lineIndex || parentActive
      const completedWord = completedWords.find((item) => item.lineIndex === lineIndex)
      const className = cn('block w-full px-4 py-2 text-center text-[clamp(1.35rem,4.8vw,2.25rem)] font-bold leading-[1.38] tracking-[-0.025em] md:text-[clamp(1.65rem,2.2vw,2.35rem)]', active || !hasMarks ? 'text-shell-foreground' : 'text-shell-foreground/70')
      return <div key={`line-${lineIndex}`} ref={active ? activeLineRef : undefined} data-active={active || undefined} data-lyric-line-row={lineIndex} data-backing-visible={backing ? backingVisible : undefined} aria-hidden={backing && !backingVisible} className={cn('synced-lyric-row mx-auto my-2 w-full max-w-2xl', backing && 'grid transition-[grid-template-rows,opacity,margin] duration-300 motion-reduce:transition-none', backing && (backingVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] -my-2 opacity-0'))}>
        <div className={backing ? 'min-h-0 overflow-hidden' : undefined}>
        <p className={className}>
          <SyncedLyricText
            line={line}
            lineIndex={lineIndex}
            wordMarks={displayWordMarks}
            activeWord={wordPresentation.active.find(word => word.lineIndex === lineIndex) ?? null}
            completedWord={completedWord ?? null}
            lineSeekMs={mark?.atMs}
            variant="player"
            activeLine={active}
            isPlaying={isPlaying}
            getCurrentTime={getCurrentTime}
            onLineSeek={seekFromLyrics}
            wordLabel={lyricWordLabel}
          />
        </p>
        </div>
      </div>
    })
  }

  function renderBookmarks() {
    if (!canSaveLocally) return null
    return (
      <section className="space-y-3 border-t border-shell-border pt-4" aria-labelledby="player-bookmarks-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="player-bookmarks-heading" className="text-base font-semibold">{t('player.bookmarks')}</h2>
          <button type="button" onClick={addBookmark} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-shell-foreground hover:bg-shell-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]">
            <BookmarkPlus className="h-4 w-4" aria-hidden="true" />{t('player.addBookmark')}
          </button>
        </div>
        {bookmarks.length ? (
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-shell-hover">
                <span className="w-12 shrink-0 tabular-nums text-sm text-shell-foreground/70">{formatTime(bookmark.time)}</span>
                {editingBookmarkId === bookmark.id ? (
                  <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(event) => { event.preventDefault(); saveBookmarkName(bookmark.id) }}>
                    <input autoFocus maxLength={100} value={bookmarkDraft} onChange={(event) => setBookmarkDraft(event.target.value)} aria-label={t('player.bookmarkName')} className="h-10 min-w-0 flex-1 rounded-lg border border-shell-border bg-shell px-2 text-sm text-shell-foreground focus-visible:outline-2 focus-visible:outline-[var(--brand-primary)]" />
                    <button type="submit" className={control} aria-label={t('common.save')}><Check className="h-4 w-4" aria-hidden="true" /></button>
                    <button type="button" onClick={() => setEditingBookmarkId(null)} className={control} aria-label={t('common.cancel')}><X className="h-4 w-4" aria-hidden="true" /></button>
                  </form>
                ) : (
                  <button type="button" onClick={() => onSeek(bookmark.time)} className="flex min-h-11 min-w-0 flex-1 items-center text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]">
                    <span className="truncate">{bookmark.label}</span>
                  </button>
                )}
                {editingBookmarkId !== bookmark.id ? <>
                  <button type="button" onClick={() => { setBookmarkDraft(bookmark.label); setEditingBookmarkId(bookmark.id) }} className={control} aria-label={t('player.editBookmark', { label: bookmark.label })}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => removeBookmark(bookmark.id)} className={control} aria-label={t('player.removeBookmark', { label: bookmark.label })}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </> : null}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-shell-foreground/65">{t('player.noBookmarks')}</p>}
      </section>
    )
  }

  function renderPlaybackControls() {
    return (
      <>
        <section className="space-y-2" aria-label={t('player.progress')}>
          <input type="range" min={0} max={duration || 1} step={0.1} value={Math.min(progress, duration || 1)} onChange={(event) => onSeek(Number(event.target.value))} disabled={duration <= 0} className="h-11 w-full accent-[var(--brand-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]" aria-label={t('player.progress')} />
          <div className="flex justify-between text-xs tabular-nums text-shell-foreground/65"><span>{formatTime(progress)}</span><span>{formatTime(duration)}</span></div>
        </section>
        <div className="flex items-center justify-center gap-5">
          <button type="button" onClick={() => onSeek(Math.max(0, progress - 10))} disabled={duration <= 0} className={control} aria-label={t('player.rewind')}><RotateCcw className="h-5 w-5" aria-hidden="true" /></button>
          <button type="button" onClick={onTogglePlay} className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[var(--brand-primary)] text-[var(--brand-on-primary)] shadow-md transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)] motion-reduce:transition-none" aria-label={isPlaying ? t('player.pause') : t('player.play')}>
            {isPlaying ? <Pause className="h-7 w-7" fill="currentColor" aria-hidden="true" /> : <Play className="ml-1 h-7 w-7" fill="currentColor" aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => onSeek(Math.min(duration, progress + 10))} disabled={duration <= 0} className={control} aria-label={t('player.forward')}><RotateCw className="h-5 w-5" aria-hidden="true" /></button>
        </div>
      </>
    )
  }

  return (
    <div
      className={cn('now-playing-overlay fixed inset-0 z-[70] flex h-[100dvh] flex-col overflow-hidden bg-shell text-shell-foreground', (swipeDistance > 0 || entryProgress != null) && 'now-playing-overlay--dragging')}
      role="dialog"
      aria-modal="true"
      aria-label={t('player.nowPlayingLabel', { title: track.title })}
      data-testid="global-player-fullscreen"
      style={entryProgress != null
        ? { transform: `translate3d(0, ${(1 - entryProgress) * 100}%, 0)`, opacity: 0.9 + entryProgress * 0.1 }
        : { transform: `translate3d(0, ${swipeDistance}px, 0)`, opacity: 1 - Math.min(swipeDistance / 1000, 0.25), borderRadius: `${Math.min(swipeDistance / 10, 12)}px` }}
      onPointerDown={handleSwipeStart}
      onPointerMove={handleSwipeMove}
      onPointerUp={handleSwipeEnd}
      onPointerCancel={() => { swipeStart.current = null; setSwipeDistance(0) }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); dismissWithAnimation(); return }
        if (event.key !== 'Tab') return
        const focusable = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled])') ?? [])
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}
      ref={sheetRef}
    >
      <header className="now-playing-swipe-handle relative z-10 flex shrink-0 items-center gap-3 bg-shell px-4 pb-3 pt-[calc(.75rem+env(safe-area-inset-top))] md:px-8">
        <button ref={closeButtonRef} type="button" onClick={dismissWithAnimation} className={control} aria-label={t('player.closeFullscreen')}><ChevronDown className="h-6 w-6" aria-hidden="true" /></button>
        <div className="min-w-0 flex-1 text-center md:text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-shell-foreground/65">{t('player.nowPlaying')}</p>
          <p className="truncate text-sm font-medium">{track.artist || t('player.fallbackArtist')}</p>
        </div>
        <span className="w-12 md:hidden" aria-hidden="true" />
      </header>

      <main className="relative z-10 mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(18rem,.85fr)_minmax(0,1.15fr)] md:gap-8 md:overflow-hidden md:px-8 md:py-6">
        <section className="now-playing-swipe-surface flex min-h-full flex-col justify-between gap-6 px-6 pb-5 pt-5 md:min-h-0 md:items-center md:justify-start md:overflow-y-auto md:px-4 md:pb-2 md:pt-2" aria-label={t('player.nowPlaying')}>
          <div className="flex w-full items-center justify-center gap-3 md:max-w-md md:gap-4">
            <div className="now-playing-artwork grid aspect-square w-[min(68vw,22rem)] shrink-0 place-items-center overflow-hidden rounded-2xl text-shell-foreground/70 md:w-[min(28vw,25rem)]" aria-hidden="true"><SonivoMark className="h-20 w-20" /></div>
            <label className="flex h-[min(68vw,22rem)] w-12 shrink-0 flex-col items-center justify-between rounded-full bg-shell-hover/55 py-3 md:h-[min(28vw,25rem)]" aria-label={t('player.volume')}>
              {volume === 0 ? <VolumeX className="h-4 w-4 shrink-0 text-shell-foreground/70" aria-hidden="true" /> : <Volume2 className="h-4 w-4 shrink-0 text-shell-foreground/70" aria-hidden="true" />}
              <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => onVolumeChange(Number(event.target.value))} className="persistent-player__range persistent-player__range--vertical" style={{ '--player-fill': `${Math.round(volume * 100)}%` } as CSSProperties} aria-valuetext={t('player.volumeValue', { percent: String(Math.round(volume * 100)) })} aria-label={t('player.volume')} />
              <span className="shrink-0 text-[10px] tabular-nums text-shell-foreground/65" aria-hidden="true">{Math.round(volume * 100)}%</span>
            </label>
          </div>
          <section className="flex w-full items-center gap-4 md:max-w-md" aria-label={t('player.nowPlaying')}>
            <div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-bold tracking-tight">{track.title}</h1><p className="truncate text-sm text-shell-foreground/70">{track.artist || t('player.fallbackArtist')}</p></div>
            {canSaveLocally ? <button type="button" onClick={toggleLike} aria-pressed={liked} aria-label={liked ? t('player.unlike') : t('player.like')} className={control}><Heart className="h-6 w-6" fill={liked ? 'currentColor' : 'none'} aria-hidden="true" /></button> : null}
            {track.practiceUrl ? <a href={track.practiceUrl} className={cn(control, 'no-underline')} aria-label={t('player.openStage')} title={t('player.openStage')}><Maximize2 className="h-5 w-5" aria-hidden="true" /></a> : null}
          </section>
          <div className="w-full md:max-w-md">{renderPlaybackControls()}</div>
          <div className="hidden md:block">{renderBookmarks()}</div>
        </section>

        <section className="hidden min-h-full px-5 pb-6 pt-3 md:flex md:min-h-0 md:flex-col md:rounded-2xl md:bg-shell-hover/25 md:px-7 md:py-6" aria-label={t('player.showLyrics')}>
          <div className="mb-4 hidden items-center justify-between gap-4 md:flex"><div className="min-w-0"><h2 className="truncate text-xl font-bold">{t('player.showLyrics')}</h2><p className="truncate text-sm text-shell-foreground/65">{track.title} · {track.artist || t('player.fallbackArtist')}</p></div><button type="button" onClick={toggleLike} aria-pressed={liked} aria-label={liked ? t('player.unlike') : t('player.like')} className={control}><Heart className="h-5 w-5" fill={liked ? 'currentColor' : 'none'} aria-hidden="true" /></button></div>
          {manualLyricsScroll && activeLineIndex >= 0 ? <button type="button" onClick={() => setManualLyricsScroll(false)} className="mb-2 min-h-11 self-center rounded-full bg-shell-hover px-4 text-sm font-semibold text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]">{t('player.followLyrics')}</button> : null}
          <div className="min-h-0 flex-1 overflow-y-auto md:rounded-xl" data-testid="player-synced-lyrics" data-player-scrollable data-player-lyrics-scrollable>{renderLyrics()}</div>
          <div className="sticky bottom-0 flex items-center justify-center gap-2 border-t border-shell-border bg-shell/90 py-2 backdrop-blur md:hidden"><button type="button" onClick={() => onSeek(Math.max(0, progress - 10))} className={control} aria-label={t('player.rewind')}><RotateCcw className="h-5 w-5" aria-hidden="true" /></button><button type="button" onClick={onTogglePlay} className="grid h-12 w-12 place-items-center rounded-full bg-[var(--brand-primary)] text-[var(--brand-on-primary)]" aria-label={isPlaying ? t('player.pause') : t('player.play')}>{isPlaying ? <Pause className="h-5 w-5" fill="currentColor" aria-hidden="true" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true" />}</button><button type="button" onClick={() => onSeek(Math.min(duration, progress + 10))} className={control} aria-label={t('player.forward')}><RotateCw className="h-5 w-5" aria-hidden="true" /></button></div>
        </section>
      </main>

      <nav className="relative z-10 grid shrink-0 grid-cols-3 bg-shell px-3 pb-[env(safe-area-inset-bottom)] pt-1 md:hidden" aria-label={t('player.quickSections')}>
        <button type="button" onClick={() => setActivePanel(activePanel === 'audio' ? null : 'audio')} aria-expanded={activePanel === 'audio'} aria-controls="player-bottom-panel" className={cn('flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium transition-colors', activePanel === 'audio' ? 'text-[var(--brand-primary)]' : 'text-shell-foreground/70')}>
          <ListMusic className="h-5 w-5" aria-hidden="true" /><span>{t('player.audioFiles')}</span>
        </button>
        <button type="button" onClick={() => setActivePanel(activePanel === 'bookmarks' ? null : 'bookmarks')} disabled={!canSaveLocally} aria-expanded={activePanel === 'bookmarks'} aria-controls="player-bottom-panel" className={cn('flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium transition-colors disabled:opacity-40', activePanel === 'bookmarks' ? 'text-[var(--brand-primary)]' : 'text-shell-foreground/70')}>
          <Bookmark className="h-5 w-5" aria-hidden="true" /><span>{t('player.bookmarksShortcut')}</span>
        </button>
        <button type="button" onClick={() => setActivePanel(activePanel === 'lyrics' ? null : 'lyrics')} aria-expanded={activePanel === 'lyrics'} aria-controls="player-bottom-panel" className={cn('flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium transition-colors', activePanel === 'lyrics' ? 'text-[var(--brand-primary)]' : 'text-shell-foreground/70')}>
          <Captions className="h-5 w-5" aria-hidden="true" /><span>{t('player.showLyrics')}</span>
        </button>
      </nav>

      {activePanel ? <>
        <button type="button" className="fixed inset-0 z-[80] cursor-default bg-black/40 md:hidden" onClick={() => setActivePanel(null)} aria-label={t('common.close')} />
        <section id="player-bottom-panel" className={cn('now-playing-panel fixed z-[81] flex flex-col bg-shell px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl md:hidden', activePanel === 'lyrics' ? 'inset-0 h-[100dvh] max-h-none rounded-none pt-[calc(.75rem+env(safe-area-inset-top))]' : 'inset-x-0 bottom-0 max-h-[72dvh] rounded-t-3xl border-t border-shell-border')} aria-label={activePanel === 'audio' ? t('player.audioFiles') : activePanel === 'bookmarks' ? t('player.bookmarks') : t('player.showLyrics')}>
          <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{activePanel === 'audio' ? t('player.audioFiles') : activePanel === 'bookmarks' ? t('player.bookmarks') : t('player.showLyrics')}</h2>
              {activePanel === 'audio' ? <p className="text-xs text-shell-foreground/65">{t('player.audioFilesHint')}</p> : null}
            </div>
            <button type="button" onClick={() => setActivePanel(null)} className={control} aria-label={t('common.close')}><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>
          {activePanel === 'lyrics' && manualLyricsScroll && activeLineIndex >= 0 ? <button type="button" onClick={() => setManualLyricsScroll(false)} className="mb-2 min-h-11 self-center rounded-full bg-shell-hover px-4 text-sm font-semibold text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]">{t('player.followLyrics')}</button> : null}
          <div className="min-h-0 flex-1 overflow-y-auto" data-player-scrollable data-player-lyrics-scrollable={activePanel === 'lyrics' ? '' : undefined}>{renderPanelContent()}</div>
        </section>
      </> : null}
    </div>
  )
}
