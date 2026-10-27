import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AudioLines, Maximize2, Minus, MonitorUp, MoreHorizontal, Music2, Pause, Play, Plus, SkipBack, SkipForward, Volume2, X } from 'lucide-react'
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
  activeChordWordLineIndexes,
  activeChordLineIndex,
  activeChordLineIndexes,
  chordWordPresentation,
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

export function isBackingVocalLine(line: ChordProLine): boolean {
  return line.kind === 'lyric' && /^\([^()]+\)$/.test(line.segments.map(segment => segment.lyric).join('').trim())
}

export function InstrumentalCue({ progress }: { progress: number }) {
  const { t } = useT()
  return (
    <div
      className="flex min-h-10 items-center gap-4 py-1 text-[color-mix(in_srgb,var(--brand-primary)_60%,white)]"
      role="status"
      aria-label={t('times.instrumentalLabel')}
      aria-live="off"
      data-testid="stage-instrumental-cue"
    >
      <span className="flex items-center gap-2 opacity-75" aria-hidden="true">
        <Music2 className="h-6 w-6" />
        <Music2 className="h-6 w-6" />
        <Music2 className="h-6 w-6" />
      </span>
      <span className="h-1.5 min-w-16 max-w-32 flex-1 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
        <span className="block h-full rounded-full bg-[var(--brand-primary)] transition-[width] duration-100 motion-reduce:transition-none" style={{ width: `${progress * 100}%` }} />
      </span>
    </div>
  )
}

export const StageLine = memo(function StageLine({
  line,
  hideChords,
  showLyrics,
  index,
  active,
  focused,
  wordMarks = [],
  lineSeekMs = null,
  wordFocus = null,
  completedWord = null,
  onSeek,
  distance = 0,
  backing = false,
  waitingForVocal = false,
}: {
  line: ChordProLine
  hideChords: boolean
  showLyrics: boolean
  index: number
  active: boolean
  focused: boolean
  wordMarks?: ChordWordTimingMark[]
  lineSeekMs?: number | null
  wordFocus?: { lineIndex: number; wordIndex: number; progress: number } | null
  completedWord?: StageWordCursor | null
  onSeek?: (seconds: number) => void
  distance?: number
  backing?: boolean
  waitingForVocal?: boolean
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
      const completed = mark != null && completedWord?.lineIndex === index && currentWordIndex <= completedWord.wordIndex
      const progress = activeByFocus ? wordFocus.progress : 0
      const seekMs = mark?.startMs ?? lineSeekMs ?? nearestTimedWordMs(currentWordIndex)
      const wordClass = completed
        ? 'text-[color-mix(in_srgb,var(--brand-primary)_68%,white)]'
        : 'text-white'
      const fillPercent = Math.round(progress * 1000) / 10
      const sweepEdgeStart = Math.max(0, fillPercent - 2)
      const sweepEdgeEnd = Math.min(100, fillPercent + 2)
      const word = <span
        className={cn('inline transition-colors duration-200 motion-reduce:transition-none', wordClass)}
        data-stage-word={currentWordIndex}
        data-word-progress={activeByFocus ? progress.toFixed(3) : undefined}
        style={activeByFocus ? {
          backgroundImage: `linear-gradient(90deg, color-mix(in srgb, var(--brand-primary) 68%, white) 0%, color-mix(in srgb, var(--brand-primary) 68%, white) ${sweepEdgeStart}%, color-mix(in srgb, var(--brand-primary) 38%, white) ${fillPercent}%, white ${sweepEdgeEnd}%, white 100%)`,
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          WebkitTextFillColor: 'transparent',
        } : undefined}
      >
        {part}
      </span>
      return onSeek && seekMs != null
        ? (
            <button
              key={`word-${currentWordIndex}`}
              type="button"
              className="inline cursor-pointer rounded-sm border-0 bg-transparent p-0 text-left text-inherit hover:underline hover:decoration-[var(--brand-primary)] hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]"
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
      data-backing-vocal={backing ? 'true' : undefined}
      style={{
        fontSize: backing ? '0.72em' : undefined,
        opacity: focused
          ? (backing ? 0.82 : 1)
          : distance < 0
            ? Math.max(0.24, 0.96 - Math.abs(distance) * 0.22)
            : waitingForVocal && distance === 0
              ? 0.3
              : Math.max(0.18, 0.66 - Math.abs(distance) * 0.18),
        '--lyric-line-blur': `${focused
          ? 0
          : distance < 0
            ? Math.min(6, Math.min(Math.abs(distance), 1) * 2.8 + Math.max(0, Math.abs(distance) - 1) * 1.1)
            : Math.min(5, Math.min(distance, 1) * 2.2 + Math.max(0, distance - 1) * 1.15)}px`,
      } as CSSProperties}
      className={cn(
        'flex w-full flex-wrap items-end justify-center gap-x-0 text-center leading-[1.3] font-semibold tracking-[-0.025em]',
        '[filter:blur(var(--lyric-line-blur))] transition-[filter,opacity,color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:[filter:none] motion-reduce:transition-none',
      )}
    >
      {line.segments.map((segment, segmentIndex) => (
        <span key={segmentIndex} className="inline-block max-w-full whitespace-pre-wrap [overflow-wrap:anywhere]">
          {hasChord ? (
            <span className="block font-semibold text-white" style={{ fontSize: '0.7em', color: 'color-mix(in srgb, var(--brand-primary) 58%, white)' }}>
              {segment.chord && segment.chord.length > 0 ? segment.chord : '\u00A0'}
            </span>
          ) : null}
          {showLyrics ? <span
            className="block font-semibold text-white"
            style={focused ? { textShadow: '0 2px 18px rgba(0,0,0,.12)' } : undefined}
          >
            {segment.lyric.length > 0 ? renderSegment(segment.lyric) : '\u00A0'}
          </span> : null}
        </span>
      ))}
    </div>
  )
}, (previous, next) => previous.line === next.line && previous.hideChords === next.hideChords && previous.index === next.index &&
  previous.active === next.active && previous.focused === next.focused && previous.distance === next.distance && previous.backing === next.backing && previous.waitingForVocal === next.waitingForVocal && previous.showLyrics === next.showLyrics &&
  previous.wordMarks === next.wordMarks && previous.lineSeekMs === next.lineSeekMs && previous.onSeek === next.onSeek &&
  previous.wordFocus?.lineIndex === next.wordFocus?.lineIndex && previous.wordFocus?.wordIndex === next.wordFocus?.wordIndex && previous.wordFocus?.progress === next.wordFocus?.progress &&
  previous.completedWord?.lineIndex === next.completedWord?.lineIndex && previous.completedWord?.wordIndex === next.completedWord?.wordIndex)

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
  const { getCurrentTime, playbackError } = useAudioPlayer()
  const { brandTokens } = useRailPresence()
  const reducedMotion = usePrefersReducedMotion()
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [showChords, setShowChords] = useState(false)
  const [showLyrics, setShowLyrics] = useState(true)
  const [moreOpen, setMoreOpen] = useState(false)
  const [moreMenuPosition, setMoreMenuPosition] = useState<CSSProperties | null>(null)
  const [fontSize, setFontSize] = usePersisted('sonivo:stage:fontSize', 44)
  const [speed, setSpeed] = usePersisted('sonivo:stage:speed', 30)
  const [autoFollow, setAutoFollow] = useState(true)
  const [scrolling, setScrolling] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [lineDistances, setLineDistances] = useState<number[]>([])
  const [stageTimeMs, setStageTimeMs] = useState(currentMs)
  const [wakeStatus, setWakeStatus] = useState<'idle' | 'active' | 'unsupported' | 'denied'>('idle')
  const [displayStatus, setDisplayStatus] = useState<'idle' | 'opening' | 'connected' | 'manual' | 'unavailable' | 'blocked'>('idle')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const moreButtonRef = useRef<HTMLDivElement | null>(null)
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
  const updateCursorFromManualScrollRef = useRef<() => void>(() => undefined)

  const measureLineDistances = useCallback((focusedLineIndex: number) => {
    const focusedLine = lineRefs.current[focusedLineIndex]
    if (!focusedLine) return
    const focusedBounds = focusedLine.getBoundingClientRect()
    const focusedCenter = (focusedBounds.top + focusedBounds.bottom) / 2
    const adjacentSteps = [focusedLineIndex - 1, focusedLineIndex + 1]
      .map(index => lineRefs.current[index]?.getBoundingClientRect())
      .filter((bounds): bounds is DOMRect => bounds != null)
      .map(bounds => Math.abs((bounds.top + bounds.bottom) / 2 - focusedCenter))
      .filter(step => step > 0)
    const step = adjacentSteps.length > 0
      ? adjacentSteps.reduce((sum, value) => sum + value, 0) / adjacentSteps.length
      : Math.max(focusedBounds.height, fontSize)
    if (step <= 0) return

    const next = Array.from({ length: lineRefs.current.length }, (_, index) => {
      const line = lineRefs.current[index]
      if (!line) return index - focusedLineIndex
      const bounds = line.getBoundingClientRect()
      return Math.round((((bounds.top + bounds.bottom) / 2 - focusedCenter) / step) * 100) / 100
    })
    setLineDistances(previous => previous.length === next.length &&
      next.every((distance, index) => Math.abs(distance - (previous[index] ?? Number.POSITIVE_INFINITY)) < 0.02)
      ? previous
      : next)
  }, [fontSize])

  useLayoutEffect(() => {
    if (!moreOpen) {
      setMoreMenuPosition(null)
      return
    }

    const updatePosition = () => {
      const button = moreButtonRef.current
      if (!button) return

      const bounds = button.getBoundingClientRect()
      const viewportPadding = 12
      const menuWidth = Math.min(288, window.innerWidth - viewportPadding * 2)
      const left = clamp(bounds.left, viewportPadding, window.innerWidth - viewportPadding - menuWidth)
      setMoreMenuPosition({
        position: 'fixed',
        left,
        top: bounds.bottom + 8,
        width: menuWidth,
        maxHeight: `calc(100dvh - ${bounds.bottom + 20}px)`,
        overflowY: 'auto',
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [moreOpen])

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
    if (!open || !hasAudio || !isPlaying) return
    let frame = 0
    let lastUpdate = 0
    const sampleAudioClock = (now: number) => {
      if (now - lastUpdate >= 1000 / 60) {
        const nextTimeMs = Math.max(0, audioClockRef.current() * 1000)
        setStageTimeMs((previous) => Math.abs(previous - nextTimeMs) >= 8 ? nextTimeMs : previous)
        lastUpdate = now
      }
      frame = requestAnimationFrame(sampleAudioClock)
    }
    frame = requestAnimationFrame(sampleAudioClock)
    return () => cancelAnimationFrame(frame)
  }, [hasAudio, isPlaying, open])

  const wordMarks = timingTimeline?.wordMarks ?? []
  const instrumentalIntervals = timingTimeline?.instrumentals ?? []
  const hasMarks = timingMarks.length > 0 || wordMarks.length > 0 || instrumentalIntervals.length > 0
  const isWarmup = displayMode === 'warmup'
  const stageTitle = modeLabel ?? t('stage.title')
  const stageHeaderSubtitle = subtitle.trim() === title.trim() ? '' : subtitle
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
  const wordPresentation = useMemo(() => chordWordPresentation(wordMarks, stageTimeMs), [wordMarks, stageTimeMs])
  const completedWordsByLine = useMemo(
    () => new Map(wordPresentation.completed.map((word) => [word.lineIndex, word])),
    [wordPresentation.completed],
  )
  const activeIndexes = useMemo(() => autoFollow
    ? [...new Set([
      ...activeChordLineIndexes(timingMarks, stageTimeMs),
      ...activeChordWordLineIndexes(wordMarks, stageTimeMs, timingMarks),
    ])].sort((left, right) => left - right)
    : [], [autoFollow, timingMarks, wordMarks, stageTimeMs])
  const wordsByLine = useMemo(() => {
    const indexed = new Map<number, ChordWordTimingMark[]>()
    for (const word of wordMarks) {
      const line = indexed.get(word.lineIndex) ?? []
      line.push(word)
      indexed.set(word.lineIndex, line)
    }
    return indexed
  }, [wordMarks])
  const lastCompletedWordMark = useMemo(() => wordMarks.reduce<ChordWordTimingMark | null>(
    (latest, mark) => mark.endMs <= stageTimeMs && (latest == null || mark.endMs > latest.endMs) ? mark : latest,
    null,
  ), [wordMarks, stageTimeMs])
  const completedWord = useMemo(() => lastCompletedWordMark
    ? { lineIndex: lastCompletedWordMark.lineIndex, wordIndex: lastCompletedWordMark.wordIndex }
    : null, [lastCompletedWordMark])
  const firstWordMarkMs = wordMarks.reduce((earliest, mark) => Math.min(earliest, mark.startMs), Number.POSITIVE_INFINITY)
  const firstLineMarkMs = timingMarks.reduce((earliest, mark) => Math.min(earliest, mark.atMs), Number.POSITIVE_INFINITY)
  const firstLyricMarkMs = Math.min(firstWordMarkMs, firstLineMarkMs)
  const explicitActiveBreak = activeInstrumental(instrumentalIntervals, stageTimeMs)
  const inferredIntroActive = !explicitActiveBreak && Number.isFinite(firstLyricMarkMs) &&
    firstLyricMarkMs >= 2000 && stageTimeMs < firstLyricMarkMs
  const activeBreak = explicitActiveBreak ?? (inferredIntroActive
    ? { progress: clamp(stageTimeMs / firstLyricMarkMs, 0, 1) }
    : null)
  const activeInstrumentalInterval = explicitActiveBreak
    ? instrumentalIntervals.find(interval => interval.startMs <= stageTimeMs && stageTimeMs < interval.endMs) ?? null
    : inferredIntroActive
      ? { type: 'instrumental' as const, startMs: 0, endMs: firstLyricMarkMs }
      : null
  const instrumentalAnchorIndex = activeInstrumentalInterval
    ? (() => {
        const nextMarks = [
          ...timingMarks.map(mark => ({ lineIndex: mark.lineIndex, atMs: mark.atMs })),
          ...wordMarks.map(mark => ({ lineIndex: mark.lineIndex, atMs: mark.startMs })),
        ].filter(mark => mark.atMs >= activeInstrumentalInterval.endMs)
          .sort((left, right) => left.atMs - right.atMs || left.lineIndex - right.lineIndex)
        if (nextMarks.length > 0) return nextMarks[0].lineIndex
        const hasEarlierVocal = timingMarks.some(mark => mark.atMs < activeInstrumentalInterval.startMs) ||
          wordMarks.some(mark => mark.startMs < activeInstrumentalInterval.startMs)
        return hasEarlierVocal ? lineCount : 0
      })()
    : null
  const markedLineIndex = activeIndexes.find(index => lines?.[index] && !isBackingVocalLine(lines[index])) ?? activeIndexes[0] ?? activeWord?.lineIndex ?? activeIndex
  const beforeFirstLyricMark = Number.isFinite(firstLyricMarkMs) && stageTimeMs < firstLyricMarkMs
  const focusedIndex = autoFollow && activeBreak && instrumentalAnchorIndex != null
    ? Math.min(instrumentalAnchorIndex, Math.max(0, lineCount - 1))
    : autoFollow && markedLineIndex != null
    ? markedLineIndex
    : autoFollow && beforeFirstLyricMark
      ? 0
      : cursor
  useLayoutEffect(() => {
    measureLineDistances(focusedIndex)
  }, [focusedIndex, measureLineDistances, open])
  const displayState: StageDisplayState = {
    activeIndex: markedLineIndex,
    wordFocus: activeWord,
    activeIndexes,
    wordFocuses: autoFollow ? wordPresentation.active : [],
    completedWords: autoFollow ? wordPresentation.completed : [],
    completedWord,
    instrumentalProgress: activeBreak?.progress ?? null,
    autoFollow,
    cursor: focusedIndex,
    fontSize,
    scrolling,
    showLyrics,
    showChords,
    speed,
  }
  const focusedIndexRef = useRef(focusedIndex)
  const displayStateRef = useRef(displayState)
  displayStateRef.current = displayState
  focusedIndexRef.current = focusedIndex

  useEffect(() => {
    const channel = displayChannelRef.current
    const sessionId = displaySessionRef.current
    if (!channel || !sessionId || displayWindowRef.current?.closed) return
    channel.postMessage({ type: 'state', sessionId, state: displayState })
  }, [activeIndex, activeIndexes, wordPresentation, activeWord?.lineIndex, activeWord?.wordIndex, activeWord?.progress, completedWord?.lineIndex, completedWord?.wordIndex, activeBreak?.progress, autoFollow, cursor, fontSize, scrolling, showLyrics, showChords, speed])

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
    const targetIndex = activeBreak && instrumentalAnchorIndex != null
      ? Math.min(instrumentalAnchorIndex, Math.max(0, lineCount - 1))
      : markedLineIndex ?? (beforeFirstLyricMark ? 0 : null)
    if (targetIndex == null || lastScrolled.current === targetIndex) return
    lastScrolled.current = targetIndex
    setCursor(targetIndex)
    const behavior = nextScrollBehaviorRef.current ?? (reducedMotion ? 'auto' : 'smooth')
    nextScrollBehaviorRef.current = null
    centerStageLine(targetIndex, behavior)
  }, [open, autoFollow, activeBreak, instrumentalAnchorIndex, lineCount, markedLineIndex, beforeFirstLyricMark, reducedMotion, centerStageLine])

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
        channel.postMessage({ type: 'state', sessionId, state: displayStateRef.current })
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
    setMoreOpen(false)
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

  const pauseFollowForManualScroll = useCallback(() => {
    if (!autoFollow) return
    setAutoFollow(false)
    setScrolling(false)
    requestAnimationFrame(() => requestAnimationFrame(() => updateCursorFromManualScrollRef.current()))
  }, [autoFollow])

  const updateCursorFromManualScroll = useCallback(() => {
    if (autoFollow) return
    const container = scrollRef.current
    if (!container) return
    const center = container.getBoundingClientRect().top + container.clientHeight / 2
    let nearestIndex = cursor
    let nearestDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < lineCount; index++) {
      const line = lineRefs.current[index]
      if (!line) continue
      const bounds = line.getBoundingClientRect()
      if (bounds.bottom <= container.getBoundingClientRect().top || bounds.top >= container.getBoundingClientRect().bottom) continue
      const distance = Math.abs((bounds.top + bounds.bottom) / 2 - center)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    }
    measureLineDistances(nearestIndex)
    setCursor((current) => current === nearestIndex ? current : nearestIndex)
  }, [autoFollow, cursor, lineCount, measureLineDistances])
  updateCursorFromManualScrollRef.current = updateCursorFromManualScroll

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
          style={{
            ...brandTokens,
            backgroundColor: '#0a0910',
            backgroundImage: 'radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--brand-primary) 26%, #30264c), #17141f 48%, #09090d 100%)',
          } as CSSProperties}
          className="fixed inset-0 z-[9999] flex h-[100dvh] w-[100dvw] min-h-0 flex-col isolate overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white"
          role="dialog"
          aria-modal="true"
          aria-label={stageTitle}
          data-testid="stage-mode"
        >
          <div className="relative flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/15 px-4 py-2 sm:px-6">
            <div className="mr-auto flex min-w-0 basis-full items-center gap-3 pr-12 sm:basis-auto sm:pr-0">
              {hasAudio ? <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[radial-gradient(circle_at_35%_30%,color-mix(in_srgb,var(--brand-primary)_88%,white),color-mix(in_srgb,var(--brand-primary)_35%,#211735)_58%,#211735)] text-white shadow-sm"><AudioLines className="h-5 w-5" strokeWidth={1.6} /></span> : null}
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{title}</p>
                {stageHeaderSubtitle ? <p className="truncate text-xs text-white/65">{stageHeaderSubtitle}</p> : null}
              </div>
            </div>
            <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-1 pb-1 sm:w-auto sm:flex-1 sm:justify-center sm:gap-2 sm:overflow-visible sm:pb-0 [&>button]:shrink-0">
              {!isWarmup ? <>
                <Button
                  variant={showLyrics ? 'primary' : 'secondary'}
                  size="sm"
                  aria-pressed={showLyrics}
                  data-testid="stage-lyrics-toggle"
                  onClick={() => setShowLyrics(visible => !visible)}
                >
                  {t('stage.lyrics')}
                </Button>
                <Button
                  variant={showChords ? 'primary' : 'secondary'}
                  size="sm"
                  aria-pressed={showChords}
                  data-testid="stage-chords-toggle"
                  onClick={() => setShowChords(visible => !visible)}
                >
                  <Music2 className="h-4 w-4" aria-hidden="true" />
                  {t('stage.chords')}
                </Button>
              </> : null}
              <Button
                variant="ghost"
                size="sm"
                className="h-11 w-9 px-0"
                aria-label={t('stage.fontSmaller')}
                data-testid="stage-font-down"
                onClick={() => adjustFont(-4)}
              >
                <Minus className="h-5 w-5" aria-hidden="true" />
              </Button>
              <span className="min-w-7 text-center text-sm tabular-nums" data-testid="stage-font-size">
                {fontSize}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 w-9 px-0"
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
                  <AudioLines className="h-4 w-4" aria-hidden="true" />
                  {autoFollow ? t('stage.followOn') : t('stage.followOff')}
                </Button>
              ) : !isWarmup ? (
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
              ) : null}

              {!isWarmup ? <div ref={moreButtonRef} className="static shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-11 w-11 px-0"
                  aria-label={t('stage.moreOptions')}
                  aria-expanded={moreOpen}
                  data-testid="stage-more-options"
                  onClick={() => setMoreOpen(open => !open)}
                >
                  <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                </Button>
                {moreOpen ? <div style={moreMenuPosition ?? { position: 'fixed', left: 0, top: 0, visibility: 'hidden' }} className="z-20 flex flex-col gap-2 rounded-xl border border-white/15 bg-[#101821] p-3 shadow-[0_12px_36px_rgba(0,0,0,.38)]">
                  <Button
                    variant={displayStatus === 'connected' ? 'primary' : 'secondary'}
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      if (displayStatus === 'connected' || displayStatus === 'manual') closeSecondaryDisplay()
                      else void openSecondaryDisplay()
                      setMoreOpen(false)
                    }}
                    data-testid="stage-secondary-display"
                  >
                    <MonitorUp className="h-4 w-4" aria-hidden="true" />
                    {displayStatus === 'connected' || displayStatus === 'manual' ? t('stage.closeDisplay') : t('stage.openDisplay')}
                  </Button>
                  {!hasMarks ? <label className="flex items-center gap-3 px-2 py-1 text-xs text-white/75">
                    {t('stage.speed')}
                    <input
                      type="range"
                      min={MIN_SPEED}
                      max={MAX_SPEED}
                      step={5}
                      value={speed}
                      aria-label={t('stage.speed')}
                      onChange={(event) => setSpeed(clamp(Number(event.target.value) || MIN_SPEED, MIN_SPEED, MAX_SPEED))}
                      className="min-w-0 flex-1 accent-[var(--brand-primary)]"
                    />
                  </label> : null}
                  {displayStatus !== 'idle' ? <span className="px-2 text-xs text-white/65" role="status" data-testid="stage-display-status">
                    {displayStatus === 'opening' ? t('stage.displayOpening') : null}
                    {displayStatus === 'connected' ? t('stage.displayConnected') : null}
                    {displayStatus === 'manual' ? t('stage.displayManual') : null}
                    {displayStatus === 'unavailable' ? t('stage.displayUnavailable') : null}
                    {displayStatus === 'blocked' ? t('stage.displayBlocked') : null}
                  </span> : null}
                </div> : null}
              </div> : null}
            </div>
            <button
              type="button"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'absolute right-3 top-2 h-11 w-11 px-0 sm:static')}
              ref={closeButtonRef}
              aria-label={t('stage.close')}
              data-testid="stage-close"
              onClick={closeStage}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <main className="flex min-h-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-8 [mask-image:linear-gradient(to_bottom,transparent,black_9%,black_88%,transparent)] sm:px-12 sm:py-8 lg:px-10 xl:px-16"
              style={{ fontSize: `${fontSize}px` }}
              data-testid="stage-scroll"
              onWheelCapture={pauseFollowForManualScroll}
              onTouchMoveCapture={pauseFollowForManualScroll}
              onScroll={updateCursorFromManualScroll}
            >
              <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center gap-y-6 text-left leading-snug sm:gap-y-9">
                <div ref={topSpacerRef} aria-hidden="true" className="shrink-0" />
                {stageContent ?? (lines
                  ? lines.map((line, index) => (
                      <div key={index}>
                        {activeBreak && instrumentalAnchorIndex === index ? <InstrumentalCue progress={activeBreak.progress} /> : null}
                        <div ref={(node) => {
                          lineRefs.current[index] = node
                        }}>
                          <StageLine
                          line={line}
                          hideChords={!showChords}
                          showLyrics={showLyrics}
                          index={index}
                          active={autoFollow && (activeIndexes.includes(index) || wordPresentation.active.some(word => word.lineIndex === index))}
                          focused={autoFollow && (activeBreak || (hasMarks && beforeFirstLyricMark))
                            ? false
                            : ((!autoFollow || !hasMarks) ? focusedIndex === index : activeIndexes.includes(index) || wordPresentation.active.some(word => word.lineIndex === index))}
                          distance={lineDistances[index] ?? index - focusedIndex}
                          backing={isBackingVocalLine(line)}
                          waitingForVocal={Boolean(activeBreak && instrumentalAnchorIndex === index)}
                          wordMarks={wordsByLine.get(index) ?? NO_WORD_MARKS}
                          lineSeekMs={timingMarks.find((mark) => mark.lineIndex === index)?.atMs}
                          wordFocus={wordPresentation.active.find(word => word.lineIndex === index) ?? null}
                          completedWord={completedWordsByLine.get(index) ?? null}
                          onSeek={hasAudio ? lineSeekHandlers[index] : undefined}
                          />
                        </div>
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
                {activeBreak && instrumentalAnchorIndex === lineCount ? <InstrumentalCue progress={activeBreak.progress} /> : null}
                <div ref={bottomSpacerRef} aria-hidden="true" className="shrink-0" />
              </div>
            </div>
          </main>

          <div className="border-t border-white/10 bg-black/20 px-4 py-3 sm:px-6">
            {hasAudio ? (
              <section aria-label={t('practice.audio.title')} className="mx-auto flex w-full max-w-5xl items-center gap-3 px-1 pb-2 sm:gap-5 sm:px-2">
                <div aria-hidden="true" className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[radial-gradient(circle_at_35%_30%,color-mix(in_srgb,var(--brand-primary)_88%,white),color-mix(in_srgb,var(--brand-primary)_35%,#211735)_58%,#211735)] text-white shadow-md sm:h-14 sm:w-14">
                  <AudioLines className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold tracking-tight text-white sm:text-base">{title}</p>
                  {subtitle.trim() !== title.trim() ? <p className="truncate text-xs text-white/65 sm:text-sm">{subtitle}</p> : null}
                  <div className="mt-1 flex items-center gap-2 text-xs tabular-nums text-white/70 sm:gap-3">
                    <span className="min-w-8 text-right">{formatTime(progress)}</span>
                    <input type="range" min={0} max={duration > 0 ? duration : 1} step={0.1} value={Math.min(progress, duration || 1)} aria-label={t('stage.playbackPosition')} onChange={(event) => seekFromStage(Number(event.target.value))} className="stage-range h-9 min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]" style={{ '--range-progress': `${duration > 0 ? (progress / duration) * 100 : 0}%` } as CSSProperties} data-testid="stage-seek" />
                    <span className="min-w-8">{formatTime(duration)}</span>
                  </div>
                </div>
                <Button variant="primary" size="lg" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full p-0 shadow-md" aria-label={isPlaying ? t('player.pause') : t('player.play')} data-testid="stage-play-pause-desktop" onClick={onTogglePlayback}>
                  {isPlaying ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
                </Button>
              </section>
            ) : null}
            {stageControls ? <div className="mx-auto mb-3 w-full max-w-5xl">{stageControls}</div> : null}
            {hasAudio ? <label className="mx-auto mb-2 flex w-full max-w-5xl items-center gap-3 text-sm text-white/75">
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
                className="stage-range h-11 min-w-0 flex-1"
                style={{ '--range-progress': `${Math.round(clamp(volume, 0, 1) * 100)}%` } as CSSProperties}
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
                className="w-16 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-center tabular-nums text-white"
                data-testid="stage-volume-value"
              />
              <span aria-hidden="true">%</span>
            </label> : null}
            {hasAudio && playbackError ? (
              <p role="alert" className="mx-auto mb-3 w-full max-w-5xl text-center text-sm text-rose-200" data-testid="stage-audio-error">
                {playbackError === 'unsupported' ? t('player.unsupportedAudio') : t('player.playbackFailed')}
              </p>
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
