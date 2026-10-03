import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minus, Pause, Play, Plus, SkipBack, SkipForward, X } from 'lucide-react'
import { fetchFeatures } from '../api/client'
import { usePersisted } from '../hooks/usePersisted'
import { useT } from '../i18n'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { looksLikeChordPro, parseChordPro, type ChordProLine } from './chordPro'
import { activeChordLineIndex, type ChordTimingMark } from './chordTiming'

const MIN_FONT = 20
const MAX_FONT = 120
const MIN_SPEED = 10
const MAX_SPEED = 120

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
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
  if (!looksLikeChordPro(text)) return null
  return parseChordPro(text).lines
}

function StageLine({
  line,
  hideChords,
  index,
  active,
}: {
  line: ChordProLine
  hideChords: boolean
  index: number
  active: boolean
}) {
  if (line.kind === 'empty') {
    return <div className="h-[0.6em]" aria-hidden data-stage-line={index} />
  }

  if (line.kind === 'comment') {
    return (
      <p data-stage-line={index} className="py-1 italic text-muted" style={{ fontSize: '0.8em' }}>
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
        className="pt-3 font-semibold uppercase tracking-wide text-muted"
        style={{ fontSize: '0.5em' }}
      >
        {name === 'soc' || name === 'start_of_chorus' ? '♪' : '•'}
      </p>
    )
  }

  const hasChord = !hideChords && line.segments.some((segment) => segment.chord != null && segment.chord.length > 0)

  return (
    <div
      data-stage-line={index}
      data-active-line={active ? 'true' : undefined}
      className={cn('flex flex-wrap items-end gap-x-0 leading-tight', active && 'rounded-lg bg-primary/10 px-2 ring-1 ring-primary/40')}
    >
      {line.segments.map((segment, segmentIndex) => (
        <span key={segmentIndex} className="inline-block whitespace-pre">
          {hasChord ? (
            <span className="block font-semibold text-primary-ink" style={{ fontSize: '0.7em' }}>
              {segment.chord && segment.chord.length > 0 ? segment.chord : '\u00A0'}
            </span>
          ) : null}
          <span className="block text-ink">{segment.lyric.length > 0 ? segment.lyric : '\u00A0'}</span>
        </span>
      ))}
    </div>
  )
}

/**
 * Phase 4.5 — Stage mode (ADR-0048 neighbourhood). A full-screen, large-type view of
 * the arrangement lyrics/chords for use on stage. Self-hides while Features:StageMode
 * is off (the API exposes it through GET /api/features). It reuses the existing
 * ChordPro parser and ADR-0031 timing marks; nothing is persisted on the server.
 */
export function StageModePanel({
  text,
  hideChords,
  timingMarks,
  currentMs,
}: {
  text: string
  hideChords: boolean
  timingMarks: ChordTimingMark[]
  currentMs: number
}) {
  const { t } = useT()
  const reducedMotion = usePrefersReducedMotion()
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [fontSize, setFontSize] = usePersisted('sonivo:stage:fontSize', 44)
  const [speed, setSpeed] = usePersisted('sonivo:stage:speed', 30)
  const [autoFollow, setAutoFollow] = useState(true)
  const [scrolling, setScrolling] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [wakeStatus, setWakeStatus] = useState<'idle' | 'active' | 'unsupported' | 'denied'>('idle')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lineRefs = useRef<Array<HTMLElement | null>>([])
  const lastScrolled = useRef<number | null>(null)

  const hasMarks = timingMarks.length > 0
  const lines = useMemo(() => toStageLines(text), [text])
  const lineCount = lines?.length ?? text.split('\n').length
  const activeIndex = useMemo(
    () => (hasMarks ? activeChordLineIndex(timingMarks, currentMs) : null),
    [hasMarks, timingMarks, currentMs],
  )

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
  useEffect(() => {
    if (!open || !autoFollow || activeIndex == null) return
    if (lastScrolled.current === activeIndex) return
    lastScrolled.current = activeIndex
    setCursor(activeIndex)
    lineRefs.current[activeIndex]?.scrollIntoView({
      block: 'center',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }, [open, autoFollow, activeIndex, reducedMotion])

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
    document.body.style.overflow = 'hidden'
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cursor, scrolling, hasMarks, autoFollow])

  function openStage() {
    setCursor(0)
    lastScrolled.current = null
    setAutoFollow(hasMarks)
    setScrolling(false)
    setWakeStatus('idle')
    setOpen(true)
  }

  function closeStage() {
    setOpen(false)
    setScrolling(false)
  }

  function focusLine(index: number) {
    const clamped = clamp(index, 0, Math.max(0, lineCount - 1))
    setCursor(clamped)
    setAutoFollow(false)
    setScrolling(false)
    lineRefs.current[clamped]?.scrollIntoView({
      block: 'center',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
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
        data-testid="stage-open"
        aria-haspopup="dialog"
      >
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
        {t('stage.open')}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-surface text-ink"
          role="dialog"
          aria-modal="true"
          aria-label={t('stage.title')}
          data-testid="stage-mode"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface px-4 py-2">
            <span className="mr-auto text-sm font-semibold">{t('stage.title')}</span>
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

            {hasMarks ? (
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
            ) : (
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
                <label className="flex items-center gap-2 text-xs text-muted">
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
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-11 w-11 px-0"
              aria-label={t('stage.close')}
              data-testid="stage-close"
              onClick={closeStage}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-6 py-10 sm:px-10"
            style={{ fontSize: `${fontSize}px` }}
            data-testid="stage-scroll"
          >
            <div className="mx-auto max-w-4xl space-y-2">
              {lines
                ? lines.map((line, index) => (
                    <div
                      key={index}
                      ref={(node) => {
                        lineRefs.current[index] = node
                      }}
                    >
                      <StageLine line={line} hideChords={hideChords} index={index} active={autoFollow && activeIndex === index} />
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
                        'leading-snug text-ink',
                        autoFollow && activeIndex === index && 'rounded-lg bg-primary/10 px-2 ring-1 ring-primary/40',
                      )}
                    >
                      {lineText.length > 0 ? lineText : '\u00A0'}
                    </div>
                  ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border-subtle bg-surface px-4 py-2">
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
            <div className="hidden text-center text-xs text-muted sm:block" role="status" data-testid="stage-status">
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
        </div>
      ) : null}
    </>
  )
}
