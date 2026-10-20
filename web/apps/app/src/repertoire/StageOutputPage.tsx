import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useRailPresence } from '../shell/railPresence'
import { useT } from '../i18n'
import { fetchFeatures } from '../api/client'
import { parseChordPro } from './chordPro'
import { activeChordLineIndex, type ChordTimingMark, type ChordTimingTimeline } from './chordTiming'
import { StageLine } from './StageModePanel'
import {
  parseStageDisplayMessage,
  stageDisplayChannelName,
  type StageDisplayState,
} from './stageDisplaySync'

const INITIAL_STATE: StageDisplayState = {
  activeIndex: null,
  wordFocus: null,
  completedWord: null,
  instrumentalProgress: null,
  autoFollow: true,
  cursor: 0,
  fontSize: 44,
  scrolling: false,
  showChords: false,
  speed: 30,
}
const NO_WORD_MARKS: ChordTimingTimeline['wordMarks'] = []

/** Read-only lyrics output. Its only input is the controller's validated display state. */
export function StageOutputPage({
  text,
  sessionId,
  timingMarks,
  timingTimeline,
}: {
  text: string
  sessionId: string
  timingMarks: ChordTimingMark[]
  timingTimeline: ChordTimingTimeline
}) {
  const { brandTokens } = useRailPresence()
  const { t } = useT()
  const [state, setState] = useState(INITIAL_STATE)
  const [enabled, setEnabled] = useState(true)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lineRefs = useRef<Array<HTMLElement | null>>([])
  const topSpacerRef = useRef<HTMLDivElement | null>(null)
  const bottomSpacerRef = useRef<HTMLDivElement | null>(null)
  const scrollTargetRef = useRef<number | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const scrollFrameTimeRef = useRef(0)
  const lines = useMemo(() => (text.trim() ? parseChordPro(text).lines : null), [text])
  const plainLines = useMemo(() => text.split('\n'), [text])
  const activeIndex = state.activeIndex ?? state.wordFocus?.lineIndex ?? (timingMarks.length ? activeChordLineIndex(timingMarks, 0) : null)
  const focusedIndex = state.autoFollow && activeIndex != null ? activeIndex : state.cursor
  const completedWord = useMemo(
    () => state.completedWord,
    [state.completedWord?.lineIndex, state.completedWord?.wordIndex],
  )

  const animateScrollTo = useCallback((requestedTop: number, behavior: ScrollBehavior) => {
    const container = scrollRef.current
    if (!container) return
    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const targetTop = Math.max(0, Math.min(requestedTop, maxTop))
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
    const step = (now: number) => {
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
      scrollFrameRef.current = requestAnimationFrame(step)
    }
    scrollFrameRef.current = requestAnimationFrame(step)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchFeatures()
      .then((features) => {
        if (cancelled) return
        setEnabled(features.stageMode)
        if (!features.stageMode) window.close()
      })
      .catch(() => {
        if (!cancelled) window.close()
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const channel = new BroadcastChannel(stageDisplayChannelName(sessionId))
    const onMessage = (event: MessageEvent<unknown>) => {
      const message = parseStageDisplayMessage(event.data, sessionId)
      if (!message) return
      if (message.type === 'state') setState(message.state)
      if (message.type === 'closed') window.close()
    }
    channel.addEventListener('message', onMessage)
    channel.postMessage({ type: 'ready', sessionId })
    const onBeforeUnload = () => channel.postMessage({ type: 'closed', sessionId })
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      channel.removeEventListener('message', onMessage)
      channel.close()
      if (scrollFrameRef.current != null) cancelAnimationFrame(scrollFrameRef.current)
    }
  }, [sessionId])

  const syncCenteredLine = useCallback(() => {
    const container = scrollRef.current
    const firstLine = lineRefs.current[0]
    const lastLine = lineRefs.current[Math.max(0, (lines?.length ?? plainLines.length) - 1)]
    if (!container || !firstLine || !lastLine) return
    const containerStyle = window.getComputedStyle(container)
    const verticalPadding = (Number.parseFloat(containerStyle.paddingTop) || 0) + (Number.parseFloat(containerStyle.paddingBottom) || 0)
    const availableHeight = Math.max(0, container.clientHeight - verticalPadding)
    if (topSpacerRef.current) topSpacerRef.current.style.height = `${Math.max(0, (availableHeight - firstLine.getBoundingClientRect().height) / 2)}px`
    if (bottomSpacerRef.current) bottomSpacerRef.current.style.height = `${Math.max(0, (availableHeight - lastLine.getBoundingClientRect().height) / 2)}px`
    const line = lineRefs.current[focusedIndex]
    if (!line) return
    const containerRect = container.getBoundingClientRect()
    const lineRect = line.getBoundingClientRect()
    const nextTop = container.scrollTop + lineRect.top - containerRect.top + lineRect.height / 2 - container.clientHeight / 2
    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    animateScrollTo(nextTop, behavior)
  }, [animateScrollTo, focusedIndex, lines, plainLines])

  useLayoutEffect(() => {
    syncCenteredLine()
  }, [syncCenteredLine, state.fontSize])

  useEffect(() => {
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(syncCenteredLine)
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    if (scrollRef.current) observer?.observe(scrollRef.current)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [syncCenteredLine])

  useEffect(() => {
    if (!state.scrolling) return
    let frame = 0
    let previous = performance.now()
    const step = (now: number) => {
      const container = scrollRef.current
      if (!container) return
      container.scrollTop += ((now - previous) / 1000) * state.speed
      previous = now
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [state.scrolling, state.speed])

  return (
    <main
      style={brandTokens as CSSProperties}
      className="fixed inset-0 z-[9999] isolate flex h-[100dvh] w-[100dvw] min-h-0 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,_color-mix(in_srgb,var(--brand-primary)_22%,#101014)_0%,_#101014_45%,_#070709_100%)] text-white"
      aria-label={t('stage.displayOutput')}
      data-testid="stage-display-output"
    >
      {enabled ? <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-8 sm:px-12 sm:py-14"
        style={{ fontSize: `${state.fontSize}px` }}
      >
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center gap-y-5 text-left leading-snug sm:gap-y-7">
          <div ref={topSpacerRef} aria-hidden="true" className="shrink-0" />
          {lines
            ? lines.map((line, index) => (
                <div key={index} ref={(node) => { lineRefs.current[index] = node }}>
                  <StageLine
                    line={line}
                    hideChords={!state.showChords}
                    index={index}
                    active={state.autoFollow && activeIndex === index}
                    focused={focusedIndex === index}
                    wordMarks={state.autoFollow ? timingTimeline.wordMarks : NO_WORD_MARKS}
                    wordFocus={state.wordFocus?.lineIndex === index ? state.wordFocus : null}
                    completedWord={completedWord}
                  />
                </div>
              ))
            : plainLines.map((line, index) => (
                <div
                  key={index}
                  ref={(node) => { lineRefs.current[index] = node }}
                  data-stage-line={index}
                  className={`rounded-2xl px-4 py-3 transition-colors duration-200 ${focusedIndex === index ? 'bg-white/10 font-semibold text-white ring-1 ring-white/20' : 'text-white/70'}`}
                >
                  {line || '\u00A0'}
                </div>
              ))}
          {state.instrumentalProgress != null ? (
            <div className="mx-auto flex w-full max-w-sm items-center gap-3 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-sm font-medium text-white/80" role="status" aria-live="off">
              <span className="shrink-0">{t('times.instrumentalLabel')}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                <span className="block h-full rounded-full bg-[var(--brand-primary)]" style={{ width: `${state.instrumentalProgress * 100}%` }} />
              </span>
            </div>
          ) : null}
          <div ref={bottomSpacerRef} aria-hidden="true" className="shrink-0" />
        </div>
      </div> : null}
    </main>
  )
}
