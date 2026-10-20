import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, EyeOff, Maximize2, Minus, MonitorUp, Pause, Play, Plus, SkipBack, SkipForward, Volume2, X } from 'lucide-react'
import { fetchFeatures } from '../api/client'
import { usePersisted } from '../hooks/usePersisted'
import { useT } from '../i18n'
import { Button, buttonVariants } from '../ui/button'
import { cn } from '../ui/cn'
import { memo, type CSSProperties, type ReactNode } from 'react'
import { useRailPresence } from '../shell/railPresence'
import { parseChordPro, type ChordProLine } from './chordPro'
import { useAudioPlayer } from './AudioPlayerContext'
import {
  activeChordLineIndex,
  activeChordWord,
  activeInstrumental,
  type ChordTimingMark,
  type ChordTimingTimeline,
  type ChordWordTimingMark,
} from './chordTiming'
import { parseStageDisplayMessage, stageDisplayChannelName, type StageDisplayState } from './stageDisplaySync'

const MIN_FONT = 20
const MAX_FONT = 120
const MIN_SPEED = 10
const MAX_SPEED = 120
const NO_WORD_MARKS: ChordWordTimingMark[] = []

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function formatTime(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

/** Split the body into display lines, mirroring the ChordPro parser when present. */
function toStageLines(text: string): ChordProLine[] | null {
  if (!text.trim()) return null
  return parseChordPro(text).lines
}

type StageWordCursor = { lineIndex: number; wordIndex: number }

export const StageLine = memo(function StageLine({
  line,
  hideChords,
  index,
  active,
  focused,
  wordMarks = [],
  lineSeekMs = null,
  wordFocus = null,
  completedWord = null,
  onSeek,
}: {
  line: ChordProLine
  hideChords: boolean
  index: number
  active: boolean
  focused: boolean
  wordMarks?: ChordWordTimingMark[]
  lineSeekMs?: number | null
  wordFocus?: { lineIndex: number; wordIndex: number; progress: number } | null
  completedWord?: StageWordCursor | null
  onSeek?: (seconds: number) => void
}) {
  const { t } = useT()
  if (line.kind === 'empty') {
    return <div className="h-[0.6em]" aria-hidden data-stage-line={index} />
  }

  if (line.kind === 'comment') {
    return (
      <p data-stage-line={index} className="py-1 italic text-white/70" style={{ fontSize: '0.8em' }}>
        {line.text}
      </p>
    )
  }

  if (line.kind === 'directive') {
    const name = line.name
    if (name !== 'soc' && name !== 'start_of_chorus' && name !== 'sov' && name !== 'start_of_verse') {
      return <div data-stage-line={index} aria-hidden className="h-[0.4em]" />
    }
    return (
      <p
        data-stage-line={index}
        className="pt-3 font-semibold uppercase tracking-wide text-white/65"
        style={{ fontSize: '0.5em' }}
      >
        {name === 'soc' || name === 'start_of_chorus' ? '♪' : '•'}
      </p>
    )
  }

  const hasChord = !hideChords && line.segments.some((segment) => segment.chord != null && segment.chord.length > 0)

  let wordIndex = 0
  const lineWordMarks = wordMarks.filter((mark) => mark.lineIndex === index)
  const markByWord = new Map(lineWordMarks.map((mark) => [mark.wordIndex, mark]))

  function nearestTimedWordMs(targetWordIndex: number): number | null {
    let nearest: ChordWordTimingMark | null = null
    for (const mark of lineWordMarks) {
      if (nearest == null || Math.abs(mark.wordIndex - targetWordIndex) < Math.abs(nearest.wordIndex - targetWordIndex)) {
        nearest = mark
      }
    }
    return nearest?.startMs ?? null
  }

  function renderSegment(text: string) {
    return (text.match(/\s+|\S+/g) ?? []).map((part, partIndex) => {
      if (/^\s+$/.test(part)) return <span key={`space-${partIndex}`}>{part}</span>
      const currentWordIndex = wordIndex++
      const mark = markByWord.get(currentWordIndex)
      const activeByFocus = wordFocus?.lineIndex === index && wordFocus.wordIndex === currentWordIndex
      const completed = mark != null && completedWord != null && (
        index < completedWord.lineIndex ||
        (index === completedWord.lineIndex && currentWordIndex <= completedWord.wordIndex)
      )
      const progress = activeByFocus ? wordFocus.progress : 0
      const style: CSSProperties = activeByFocus
        ? {
            backgroundImage: `linear-gradient(90deg, color-mix(in srgb, var(--brand-primary) 58%, white) ${progress * 100}%, rgba(255,255,255,.7) ${progress * 100}%)`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
            filter: 'drop-shadow(0 0 12px color-mix(in srgb, var(--brand-primary) 46%, transparent))',
          }
        : {}
      const seekMs = mark?.startMs ?? lineSeekMs ?? nearestTimedWordMs(currentWordIndex)
      const wordClass = mark == null
        ? ''
        : completed
          ? 'text-[color-mix(in_srgb,var(--brand-primary)_58%,white)]'
          : !activeByFocus
            ? 'text-white/55'
            : 'font-bold'
      const word = <span className={wordClass} style={style}>{part}</span>
      return onSeek && seekMs != null
        ? (
            <button
              key={`word-${currentWordIndex}`}
              type="button"
              className="cursor-pointer rounded-sm border-0 bg-transparent p-0 text-inherit hover:underline hover:decoration-[var(--brand-primary)] hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]"
              style={{ font: 'inherit', lineHeight: 'inherit' }}
              aria-label={t('stage.seekWord', { word: part })}
              onClick={() => onSeek(seekMs / 1000)}
            >
              {word}
            </button>
          )
        : <span key={`word-${currentWordIndex}`}>{word}</span>
    })
  }

  return (
    <div
      data-stage-line={index}
      data-active-line={active ? 'true' : undefined}
      className={cn(
        'flex flex-wrap items-end justify-start gap-x-0 leading-tight transition-colors duration-200 motion-reduce:transition-none',
        focused && 'origin-left scale-[1.045] text-white',
        !focused && 'scale-[0.985] opacity-40 blur-[2px]',
        'transition-[transform,filter,opacity,color] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transform-none motion-reduce:filter-none motion-reduce:transition-none',
      )}
    >
      {line.segments.map((segment, segmentIndex) => (
        <span key={segmentIndex} className="inline-block whitespace-pre">
          {hasChord ? (
            <span className="block font-semibold text-white" style={{ fontSize: '0.7em', color: 'color-mix(in srgb, var(--brand-primary) 58%, white)' }}>
              {segment.chord && segment.chord.length > 0 ? segment.chord : '\u00A0'}
            </span>
          ) : null}
          <span
            className={cn('block transition-[color,text-shadow,font-weight] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none', focused ? 'font-semibold text-white' : 'text-white/70')}
            style={focused ? { textShadow: '0 3px 20px color-mix(in srgb, var(--brand-primary) 32%, transparent)' } : undefined}
          >
            {segment.lyric.length > 0 ? renderSegment(segment.lyric) : '\u00A0'}
          </span>
        </span>
      ))}
    </div>
  )
})

/**
 * Phase 4.5 — Stage mode (ADR-0048 neighbourhood). A full-screen, large-type view of
 * the arrangement lyrics/chords for use on stage. Self-hides while Features:StageMode
 * is off (the API exposes it through GET /api/features). It reuses the existing
 * ChordPro parser and ADR-0031 timing marks; nothing is persisted on the server.
 */
export function StageModePanel({
  text,
  timingMarks,
  timingTimeline,
  currentMs,
  title,
  subtitle,
  hasAudio,
  isPlaying,
  progress,
  duration,
  onTogglePlayback,
  onSeek,
  groupId,
  arrangementId,
  volume,
  onVolumeChange,
  displayMode = 'rehearsal',
  modeLabel,
  stageContent,
  stageControls,
  openTestId = 'stage-open',
  openLabel,
}: {
  text: string
  timingMarks: ChordTimingMark[]
  timingTimeline?: ChordTimingTimeline
  currentMs: number
  title: string
  subtitle: string
  hasAudio: boolean
  isPlaying: boolean
  progress: number
  duration: number
  onTogglePlayback: () => void
  onSeek: (seconds: number) => void
  groupId: string
  arrangementId: string
  volume: number
  onVolumeChange: (volume: number) => void
  displayMode?: 'rehearsal' | 'warmup'
  modeLabel?: string
  stageContent?: ReactNode
  stageControls?: ReactNode
  openTestId?: string
  openLabel?: string
}) {
  const { t } = useT()
  const { getCurrentTime } = useAudioPlayer()
  const { brandTokens } = useRailPresence()
  const reducedMotion = usePrefersReducedMotion()
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [showChords, setShowChords] = useState(false)
  const [fontSize, setFontSize] = usePersisted('sonivo:stage:fontSize', 44)
  const [speed, setSpeed] = usePersisted('sonivo:stage:speed', 30)
  const [autoFollow, setAutoFollow] = useState(true)
  const [scrolling, setScrolling] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [stageTimeMs, setStageTimeMs] = useState(currentMs)
  const [wakeStatus, setWakeStatus] = useState<'idle' | 'active' | 'unsupported' | 'denied'>('idle')
  const [displayStatus, setDisplayStatus] = useState<'idle' | 'opening' | 'connected' | 'manual' | 'unavailable' | 'blocked'>('idle')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const ownsFullscreenRef = useRef(false)
  const stageOpenRef = useRef(false)
  const lineRefs = useRef<Array<HTMLElement | null>>([])
  const topSpacerRef = useRef<HTMLDivElement | null>(null)
  const bottomSpacerRef = useRef<HTMLDivElement | null>(null)
  const scrollTargetRef = useRef<number | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const scrollFrameTimeRef = useRef(0)
  const lastScrolled = useRef<number | null>(null)
  const displayWindowRef = useRef<Window | null>(null)
  const displayChannelRef = useRef<BroadcastChannel | null>(null)
  const displaySessionRef = useRef<string | null>(null)
  const displayPlacementRef = useRef<'automatic' | 'manual'>('automatic')
  const audioClockRef = useRef(getCurrentTime)
  audioClockRef.current = getCurrentTime
  const nextScrollBehaviorRef = useRef<ScrollBehavior | null>(null)
  const previousReportedTimeRef = useRef(currentMs)

  useEffect(() => {
    if (Math.abs(currentMs - previousReportedTimeRef.current) > 350) {
      nextScrollBehaviorRef.current = 'auto'
    }
    previousReportedTimeRef.current = currentMs
    setStageTimeMs(currentMs)
  }, [currentMs])

  // HTMLMediaElement timeupdate is intentionally low frequency (often only
  // four times per second). Sample the real audio clock while Stage is visible
  // so word fills advance smoothly without rerendering the full Practice page.
  useEffect(() => {
    if (!open || !autoFollow || !hasAudio || !isPlaying) return
    let frame = 0
    let lastUpdate = 0
    const sampleAudioClock = (now: number) => {
      if (now - lastUpdate >= 1000 / 30) {
        const nextTimeMs = Math.max(0, audioClockRef.current() * 1000)
        setStageTimeMs((previous) => Math.abs(previous - nextTimeMs) >= 12 ? nextTimeMs : previous)
        lastUpdate = now
      }
      frame = requestAnimationFrame(sampleAudioClock)
    }
    frame = requestAnimationFrame(sampleAudioClock)
    return () => cancelAnimationFrame(frame)
  }, [autoFollow, hasAudio, isPlaying, open])

  const wordMarks = timingTimeline?.wordMarks ?? []
  const instrumentalIntervals = timingTimeline?.instrumentals ?? []
  const hasMarks = timingMarks.length > 0 || wordMarks.length > 0 || instrumentalIntervals.length > 0
  const isWarmup = displayMode === 'warmup'
  const stageTitle = modeLabel ?? t('stage.title')
  const lines = useMemo(() => toStageLines(text), [text])
  const lineCount = lines?.length ?? text.split('\n').length
  const activeIndex = useMemo(
    () => (hasMarks ? activeChordLineIndex(timingMarks, stageTimeMs) : null),
    [hasMarks, timingMarks, stageTimeMs],
  )
  const activeWord = useMemo(
    () => autoFollow ? activeChordWord(wordMarks, stageTimeMs) : null,
    [autoFollow, wordMarks, stageTimeMs],
  )
  const lastCompletedWordMark = useMemo(() => wordMarks.reduce<ChordWordTimingMark | null>(
    (latest, mark) => mark.endMs <= stageTimeMs && (latest == null || mark.endMs > latest.endMs) ? mark : latest,
    null,
  ), [wordMarks, stageTimeMs])
  const completedWord = useMemo(() => lastCompletedWordMark
    ? { lineIndex: lastCompletedWordMark.lineIndex, wordIndex: lastCompletedWordMark.wordIndex }
    : null, [lastCompletedWordMark])
  const activeBreak = useMemo(
    () => autoFollow ? activeInstrumental(instrumentalIntervals, stageTimeMs) : null,
    [autoFollow, instrumentalIntervals, stageTimeMs],
  )
  const markedLineIndex = activeIndex ?? activeWord?.lineIndex ?? null
  const firstWordMarkMs = wordMarks.reduce((earliest, mark) => Math.min(earliest, mark.startMs), Number.POSITIVE_INFINITY)
  const firstLineMarkMs = timingMarks.reduce((earliest, mark) => Math.min(earliest, mark.atMs), Number.POSITIVE_INFINITY)
  const firstLyricMarkMs = Math.min(firstWordMarkMs, firstLineMarkMs)
  const beforeFirstLyricMark = Number.isFinite(firstLyricMarkMs) && stageTimeMs < firstLyricMarkMs
  const focusedIndex = autoFollow && markedLineIndex != null
    ? markedLineIndex
    : autoFollow && beforeFirstLyricMark
      ? 0
      : cursor
  const displayState: StageDisplayState = {
    activeIndex: markedLineIndex,
    wordFocus: activeWord,
    completedWord,
    instrumentalProgress: activeBreak?.progress ?? null,
    autoFollow,
    cursor: focusedIndex,
    fontSize,
    scrolling,
    showChords,
    speed,
  }
  const focusedIndexRef = useRef(focusedIndex)
  focusedIndexRef.current = focusedIndex

  useEffect(() => {
    const channel = displayChannelRef.current
    const sessionId = displaySessionRef.current
    if (!channel || !sessionId || displayWindowRef.current?.closed) return
    channel.postMessage({ type: 'state', sessionId, state: displayState })
  }, [activeIndex, activeWord?.lineIndex, activeWord?.wordIndex, activeWord?.progress, completedWord?.lineIndex, completedWord?.wordIndex, activeBreak?.progress, autoFollow, cursor, fontSize, scrolling, showChords, speed])

  useEffect(() => () => {
    const sessionId = displaySessionRef.current
    if (sessionId) displayChannelRef.current?.postMessage({ type: 'closed', sessionId })
    displayChannelRef.current?.close()
    displayWindowRef.current?.close()
    if (scrollFrameRef.current != null) cancelAnimationFrame(scrollFrameRef.current)
  }, [])

  const centerStageLine = useCallback((lineIndex: number, behavior: ScrollBehavior = 'auto') => {
    const container = scrollRef.current
    const line = lineRefs.current[lineIndex]
    if (!container || !line) return

    const containerRect = container.getBoundingClientRect()
    const lineRect = line.getBoundingClientRect()
    const viewportTop = containerRect.top + container.clientTop
    const desiredTop =
      container.scrollTop +
      lineRect.top - viewportTop +
      lineRect.height / 2 -
      container.clientHeight / 2
    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const targetTop = clamp(desiredTop, 0, maxTop)
    if (behavior === 'auto') {
      if (scrollFrameRef.current != null) cancelAnimationFrame(scrollFrameRef.current)
      scrollFrameRef.current = null
      scrollTargetRef.current = null
      container.scrollTop = targetTop
      return
    }

    scrollTargetRef.current = targetTop
    if (scrollFrameRef.current != null) return
    scrollFrameTimeRef.current = 0
    const animateScroll = (now: number) => {
      const currentContainer = scrollRef.current
      const currentTarget = scrollTargetRef.current
      if (!currentContainer || currentTarget == null) {
        scrollFrameRef.current = null
        return
      }
      const elapsed = scrollFrameTimeRef.current === 0 ? 16 : Math.min(50, now - scrollFrameTimeRef.current)
      scrollFrameTimeRef.current = now
      const easing = 1 - Math.exp(-elapsed / 115)
      const distance = currentTarget - currentContainer.scrollTop
      if (Math.abs(distance) < 0.6) {
        currentContainer.scrollTop = currentTarget
        scrollTargetRef.current = null
        scrollFrameRef.current = null
        return
      }
      currentContainer.scrollTop += distance * easing
      scrollFrameRef.current = requestAnimationFrame(animateScroll)
    }
    scrollFrameRef.current = requestAnimationFrame(animateScroll)
  }, [])

  const syncStageLayout = useCallback((lineIndex: number) => {
    const container = scrollRef.current
    const firstLine = lineRefs.current[0]
    const lastLine = lineRefs.current[Math.max(0, lineCount - 1)]
    if (!container || !firstLine || !lastLine) return

    const styles = window.getComputedStyle(container)
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0
    const availableHeight = Math.max(0, container.clientHeight - paddingTop - paddingBottom)
    const firstHeight = firstLine.getBoundingClientRect().height
    const lastHeight = lastLine.getBoundingClientRect().height
    const topSpace = Math.max(0, (availableHeight - firstHeight) / 2)
    const bottomSpace = Math.max(0, (availableHeight - lastHeight) / 2)

    if (topSpacerRef.current) topSpacerRef.current.style.height = `${topSpace}px`
    if (bottomSpacerRef.current) bottomSpacerRef.current.style.height = `${bottomSpace}px`
    centerStageLine(lineIndex)
  }, [centerStageLine, lineCount])

  // Hidden entirely while the server flag is off.
  useEffect(() => {
    let cancelled = false
    fetchFeatures()
      .then((flags) => {
        if (!cancelled) setEnabled(flags.stageMode)
      })
      .catch(() => {
        if (!cancelled) setEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Follow the timing marks while the audio plays (default when marks exist).
  useLayoutEffect(() => {
    if (!open || !autoFollow) return
    const targetIndex = markedLineIndex ?? (beforeFirstLyricMark ? 0 : null)
    if (targetIndex == null || lastScrolled.current === targetIndex) return
    lastScrolled.current = targetIndex
    setCursor(targetIndex)
    const behavior = nextScrollBehaviorRef.current ?? (reducedMotion ? 'auto' : 'smooth')
    nextScrollBehaviorRef.current = null
    centerStageLine(targetIndex, behavior)
  }, [open, autoFollow, markedLineIndex, beforeFirstLyricMark, reducedMotion, centerStageLine])

  const seekFromStage = useCallback((seconds: number, lineIndex?: number) => {
    const targetSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
    nextScrollBehaviorRef.current = 'auto'
    setStageTimeMs(targetSeconds * 1000)
    if (lineIndex != null) {
      setAutoFollow(true)
      setCursor(lineIndex)
      lastScrolled.current = lineIndex
      centerStageLine(lineIndex, 'auto')
    }
    onSeek(targetSeconds)
  }, [centerStageLine, onSeek])

  const lineSeekHandlers = useMemo(
    () => lines?.map((_, index) => (seconds: number) => seekFromStage(seconds, index)) ?? [],
    [lines, seekFromStage],
  )

  // Start on the current line and keep it centered when fullscreen or font size
  // changes alter the available reading area.
  useLayoutEffect(() => {
    if (!open) return
    syncStageLayout(focusedIndex)
  }, [open, fontSize, lineCount, syncStageLayout])

  useEffect(() => {
    if (!open) return
    let frame = 0
    const scheduleLayoutSync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => syncStageLayout(focusedIndexRef.current))
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleLayoutSync)
    if (scrollRef.current) observer?.observe(scrollRef.current)
    window.addEventListener('resize', scheduleLayoutSync)
    document.addEventListener('fullscreenchange', scheduleLayoutSync)
    scheduleLayoutSync()
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', scheduleLayoutSync)
      document.removeEventListener('fullscreenchange', scheduleLayoutSync)
    }
  }, [open, syncStageLayout])

  // Manual auto-scroll for arrangements without timing marks.
  useEffect(() => {
    if (!open || !scrolling) return
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const element = scrollRef.current
      if (!element) return
      const delta = ((now - last) / 1000) * speed
      last = now
      element.scrollTop += delta
      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1
      if (element.scrollHeight > element.clientHeight + 1 && atBottom) {
        setScrolling(false)
        return
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [open, scrolling, speed])

  // Screen Wake Lock: best effort, warns instead of failing.
  useEffect(() => {
    if (!open) return
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    if (!nav.wakeLock) {
      setWakeStatus('unsupported')
      return
    }
    let cancelled = false
    let sentinel: { release: () => Promise<void> } | null = null
    nav.wakeLock
      .request('screen')
      .then((lock) => {
        if (cancelled) {
          void lock.release().catch(() => undefined)
          return
        }
        sentinel = lock
        setWakeStatus('active')
      })
      .catch(() => {
        if (!cancelled) setWakeStatus('denied')
      })
    return () => {
      cancelled = true
      sentinel?.release().catch(() => undefined)
    }
  }, [open])

  // Lock the page scroll and own the keyboard while the overlay is open.
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeStage()
        return
      }
      if (event.key === 'Tab') {
        const controls = document.querySelectorAll<HTMLElement>(
          '[data-testid="stage-mode"] button:not(:disabled), [data-testid="stage-mode"] input:not(:disabled)',
        )
        const first = controls.item(0)
        const last = controls.item(controls.length - 1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault()
        focusLine(cursor + 1)
        return
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        focusLine(cursor - 1)
        return
      }
      if (event.key === ' ') {
        event.preventDefault()
        toggleScroll()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cursor, scrolling, hasMarks, autoFollow])

  function openStage() {
    stageOpenRef.current = true
    setCursor(0)
    lastScrolled.current = null
    setAutoFollow(hasMarks)
    setScrolling(false)
    setWakeStatus('idle')
    setShowChords(false)
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen()
        .then(() => {
          if (stageOpenRef.current) {
            ownsFullscreenRef.current = true
          } else {
            void document.exitFullscreen().catch(() => undefined)
          }
        })
        .catch(() => undefined)
    }
    setOpen(true)
  }

  async function openSecondaryDisplay() {
    if (!('BroadcastChannel' in window)) {
      setDisplayStatus('unavailable')
      return
    }
    const displayWindow = window.open('about:blank', '_blank', 'popup,width=1100,height=760')
    if (!displayWindow) {
      setDisplayStatus('blocked')
      return
    }
    displayWindow.opener = null
    displayWindowRef.current?.close()
    displayChannelRef.current?.close()
    const sessionId = crypto.randomUUID()
    const channel = new BroadcastChannel(stageDisplayChannelName(sessionId))
    displayWindowRef.current = displayWindow
    displayChannelRef.current = channel
    displaySessionRef.current = sessionId
    displayPlacementRef.current = 'automatic'
    setDisplayStatus('opening')

    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = parseStageDisplayMessage(event.data, sessionId)
      if (!message) return
      if (message.type === 'ready') {
        channel.postMessage({ type: 'state', sessionId, state: displayState })
        setDisplayStatus(displayPlacementRef.current === 'automatic' ? 'connected' : 'manual')
      } else if (message.type === 'closed') {
        setDisplayStatus('idle')
        channel.close()
        if (displayWindowRef.current === displayWindow) displayWindowRef.current = null
      }
    }
    const outputUrl = new URL(window.location.href)
    outputUrl.search = ''
    outputUrl.searchParams.set('stageOutput', '1')
    outputUrl.searchParams.set('stageSession', sessionId)

    try {
      const screenApi = window as Window & {
        getScreenDetails?: () => Promise<{
          currentScreen: { left: number; top: number; availLeft: number; availTop: number; availWidth: number; availHeight: number }
          screens: Array<{ left: number; top: number; availLeft: number; availTop: number; availWidth: number; availHeight: number }>
        }>
      }
      if (screenApi.getScreenDetails) {
        const details = await screenApi.getScreenDetails()
        const secondary = details.screens.find(
          (screen) => screen !== details.currentScreen &&
            (screen.left !== details.currentScreen.left || screen.top !== details.currentScreen.top),
        )
        if (!secondary) {
          displayWindow.close()
          channel.close()
          displayWindowRef.current = null
          displayChannelRef.current = null
          displaySessionRef.current = null
          setDisplayStatus('unavailable')
          return
        }
        displayWindow.moveTo(secondary.availLeft, secondary.availTop)
        displayWindow.resizeTo(secondary.availWidth, secondary.availHeight)
        displayWindow.location.replace(outputUrl.toString())
      } else {
        displayPlacementRef.current = 'manual'
        displayWindow.location.replace(outputUrl.toString())
        setDisplayStatus('manual')
      }
    } catch {
      // Permission denial or browser limitations still allow a manually moved window.
      displayPlacementRef.current = 'manual'
      displayWindow.location.replace(outputUrl.toString())
      setDisplayStatus('manual')
    }
    window.focus()
  }

  function closeSecondaryDisplay() {
    const sessionId = displaySessionRef.current
    if (sessionId) displayChannelRef.current?.postMessage({ type: 'closed', sessionId })
    displayWindowRef.current?.close()
    displayChannelRef.current?.close()
    displayWindowRef.current = null
    displayChannelRef.current = null
    displaySessionRef.current = null
    setDisplayStatus('idle')
  }

  function closeStage() {
    stageOpenRef.current = false
    setOpen(false)
    setScrolling(false)
    closeSecondaryDisplay()
    if (ownsFullscreenRef.current && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    }
    ownsFullscreenRef.current = false
  }

  function focusLine(index: number) {
    const clamped = clamp(index, 0, Math.max(0, lineCount - 1))
    setCursor(clamped)
    setAutoFollow(false)
    setScrolling(false)
    centerStageLine(clamped, reducedMotion ? 'auto' : 'smooth')
  }

  function toggleScroll() {
    if (hasMarks) {
      setAutoFollow((value) => !value)
      setScrolling(false)
    } else {
      setScrolling((value) => !value)
    }
  }

  function adjustFont(delta: number) {
    setFontSize(clamp(fontSize + delta, MIN_FONT, MAX_FONT))
  }

  if (!enabled) return null

  return (
    <>
      <Button
        variant="secondary"
        onClick={openStage}
        data-testid={openTestId}
        aria-haspopup="dialog"
      >
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
        {openLabel ?? t('stage.open')}
      </Button>

      {open ? createPortal((
        <div
          style={brandTokens as CSSProperties}
          className="fixed inset-0 z-[9999] flex h-[100dvh] w-[100dvw] min-h-0 flex-col isolate overflow-hidden bg-[radial-gradient(ellipse_at_top,_color-mix(in_srgb,var(--brand-primary)_22%,#101014)_0%,_#101014_45%,_#070709_100%)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white"
          role="dialog"
          aria-modal="true"
          aria-label={stageTitle}
          data-testid="stage-mode"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/20 px-4 py-2 sm:px-6">
            <div className="mr-auto min-w-0">
              <p className="truncate text-sm font-semibold text-white">{title}</p>
              <p className="truncate text-xs text-white/65">{subtitle} · {stageTitle}</p>
            </div>
            {!isWarmup ? (
              <Button
                variant={displayStatus === 'connected' ? 'primary' : 'secondary'}
                size="sm"
                onClick={displayStatus === 'connected' || displayStatus === 'manual' ? closeSecondaryDisplay : () => void openSecondaryDisplay()}
                data-testid="stage-secondary-display"
              >
                <MonitorUp className="h-4 w-4" aria-hidden="true" />
                {displayStatus === 'connected' || displayStatus === 'manual' ? t('stage.closeDisplay') : t('stage.openDisplay')}
              </Button>
            ) : null}
            {displayStatus !== 'idle' ? (
              <span className="w-full text-right text-xs text-white/65 sm:order-1" role="status" data-testid="stage-display-status">
                {displayStatus === 'opening' ? t('stage.displayOpening') : null}
                {displayStatus === 'connected' ? t('stage.displayConnected') : null}
                {displayStatus === 'manual' ? t('stage.displayManual') : null}
                {displayStatus === 'unavailable' ? t('stage.displayUnavailable') : null}
                {displayStatus === 'blocked' ? t('stage.displayBlocked') : null}
              </span>
            ) : null}
            {!isWarmup ? <Button
              variant={showChords ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={showChords}
              data-testid="stage-chords-toggle"
              onClick={() => setShowChords((visible) => !visible)}
            >
              {showChords ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
              {showChords ? t('stage.hideChords') : t('stage.showChords')}
            </Button> : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-11 w-11 px-0"
              aria-label={t('stage.fontSmaller')}
              data-testid="stage-font-down"
              onClick={() => adjustFont(-4)}
            >
              <Minus className="h-5 w-5" aria-hidden="true" />
            </Button>
            <span className="min-w-10 text-center text-sm tabular-nums" data-testid="stage-font-size">
              {fontSize}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-11 w-11 px-0"
              aria-label={t('stage.fontLarger')}
              data-testid="stage-font-up"
              onClick={() => adjustFont(4)}
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </Button>

            {!isWarmup && hasMarks ? (
              <Button
                variant={autoFollow ? 'primary' : 'secondary'}
                size="sm"
                data-testid="stage-follow"
                aria-pressed={autoFollow}
                onClick={toggleScroll}
              >
                {autoFollow ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                {autoFollow ? t('stage.followOn') : t('stage.followOff')}
              </Button>
            ) : !isWarmup ? (
              <>
                <Button
                  variant={scrolling ? 'primary' : 'secondary'}
                  size="sm"
                  data-testid="stage-scroll-toggle"
                  aria-pressed={scrolling}
                  onClick={toggleScroll}
                >
                  {scrolling ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                  {scrolling ? t('stage.scrollPause') : t('stage.scrollPlay')}
                </Button>
                <label className="flex items-center gap-2 text-xs text-white/65">
                  {t('stage.speed')}
                  <input
                    type="range"
                    min={MIN_SPEED}
                    max={MAX_SPEED}
                    step={5}
                    value={speed}
                    aria-label={t('stage.speed')}
                    onChange={(event) => setSpeed(clamp(Number(event.target.value) || MIN_SPEED, MIN_SPEED, MAX_SPEED))}
                  />
                </label>
              </>
            ) : null}

            <button
              type="button"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-11 w-11 px-0')}
              ref={closeButtonRef}
              aria-label={t('stage.close')}
              data-testid="stage-close"
              onClick={closeStage}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-8 sm:px-10 sm:py-12"
            style={{ fontSize: `${fontSize}px` }}
            data-testid="stage-scroll"
          >
            <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center gap-y-4 text-left leading-snug sm:gap-y-6">
              <div ref={topSpacerRef} aria-hidden="true" className="shrink-0" />
              {stageContent ?? (lines
                ? lines.map((line, index) => (
                    <div
                      key={index}
                      ref={(node) => {
                        lineRefs.current[index] = node
                      }}
                    >
                      <StageLine
                        line={line}
                        hideChords={!showChords}
                        index={index}
                        active={autoFollow && activeIndex === index}
                        focused={focusedIndex === index}
                        wordMarks={autoFollow ? wordMarks : NO_WORD_MARKS}
                        lineSeekMs={timingMarks.find((mark) => mark.lineIndex === index)?.atMs}
                        wordFocus={activeWord?.lineIndex === index ? activeWord : null}
                        completedWord={completedWord}
                        onSeek={hasAudio ? lineSeekHandlers[index] : undefined}
                      />
                    </div>
                  ))
                : text.split('\n').map((lineText, index) => (
                    <div
                      key={index}
                      ref={(node) => {
                        lineRefs.current[index] = node
                      }}
                      data-stage-line={index}
                      data-active-line={autoFollow && activeIndex === index ? 'true' : undefined}
                      className={cn(
                        'rounded-2xl px-4 py-3 leading-snug transition-colors duration-200 motion-reduce:transition-none',
                        focusedIndex === index ? 'bg-white/10 font-semibold text-white ring-1 ring-white/20' : 'text-white/70',
                      )}
                    >
                      {lineText.length > 0 ? lineText : '\u00A0'}
                    </div>
                )))}
              {activeBreak && autoFollow ? (
                <div className="mx-auto flex w-full max-w-sm items-center gap-3 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-sm font-medium text-white/80" role="status" aria-live="off">
                  <span className="shrink-0">{t('times.instrumentalLabel')}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                    <span className="block h-full rounded-full bg-[var(--brand-primary)] transition-[width] duration-100 motion-reduce:transition-none" style={{ width: `${activeBreak.progress * 100}%` }} />
                  </span>
                </div>
              ) : null}
              <div ref={bottomSpacerRef} aria-hidden="true" className="shrink-0" />
            </div>
          </div>

          <div className="border-t border-white/10 bg-black/25 px-4 py-3 sm:px-6">
            {stageControls ? <div className="mx-auto mb-3 w-full max-w-5xl">{stageControls}</div> : null}
            {hasAudio ? <label className="mx-auto mb-3 flex w-full max-w-5xl items-center gap-3 text-sm text-white/75">
              <Volume2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="sr-only">{t('player.volume')}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(clamp(volume, 0, 1) * 100)}
                aria-label={t('player.volume')}
                onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
                className="h-11 min-w-0 flex-1 accent-[var(--brand-primary)]"
                data-testid="stage-volume"
              />
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(clamp(volume, 0, 1) * 100)}
                aria-label={t('player.volumePercentage')}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isFinite(next)) onVolumeChange(clamp(next, 0, 100) / 100)
                }}
                className="w-14 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-center tabular-nums text-white"
                data-testid="stage-volume-value"
              />
              <span aria-hidden="true">%</span>
            </label> : null}
            {hasAudio ? (
              <div className="mx-auto mb-3 flex w-full max-w-5xl items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-11 min-w-11 rounded-full"
                  aria-label={isPlaying ? t('player.pause') : t('player.play')}
                  data-testid="stage-play-pause"
                  onClick={onTogglePlayback}
                >
                  {isPlaying ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
                </Button>
                <input
                  type="range"
                  min={0}
                  max={duration > 0 ? duration : 1}
                  step={0.1}
                  value={Math.min(progress, duration || 1)}
                  aria-label={t('stage.playbackPosition')}
                  onChange={(event) => seekFromStage(Number(event.target.value))}
                  className="h-11 min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]"
                  style={{ accentColor: 'var(--brand-primary)' }}
                  data-testid="stage-seek"
                />
                <span className="min-w-20 text-right text-xs tabular-nums text-white/70">{formatTime(progress)} / {formatTime(duration)}</span>
              </div>
            ) : null}
            {!isWarmup ? (
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="stage-prev"
                  aria-label={t('stage.previous')}
                  onClick={() => focusLine(cursor - 1)}
                >
                  <SkipBack className="h-4 w-4" aria-hidden="true" />
                  {t('stage.previous')}
                </Button>
                <div className="hidden text-center text-xs text-white/65 sm:block" role="status" data-testid="stage-status">
                  {hasMarks ? t('stage.followHint') : t('stage.noMarksHint')}
                  {wakeStatus === 'active' ? ` ${t('stage.wakeActive')}` : null}
                  {wakeStatus === 'unsupported' ? ` ${t('stage.wakeUnsupported')}` : null}
                  {wakeStatus === 'denied' ? ` ${t('stage.wakeDenied')}` : null}
                  {` ${t('stage.exitHint')}`}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="stage-next"
                  aria-label={t('stage.next')}
                  onClick={() => focusLine(cursor + 1)}
                >
                  {t('stage.next')}
                  <SkipForward className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ), document.body) : null}
    </>
  )
}
