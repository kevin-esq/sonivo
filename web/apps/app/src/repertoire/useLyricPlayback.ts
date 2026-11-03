'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  activeChordLineIndexes,
  activeChordWordLineIndexes,
  chordWordPresentation,
  type ChordTimingTimeline,
} from './chordTiming'

type LyricPlaybackSnapshot = {
  timeMs: number
  activeLines: number[]
  wordPresentation: ReturnType<typeof chordWordPresentation>
  instrumentalIndex: number
}

function sampleLyrics(
  timeline: ChordTimingTimeline,
  timeMs: number,
): LyricPlaybackSnapshot {
  const activeLines = [...new Set([
    ...activeChordLineIndexes(timeline.lineMarks, timeMs),
    ...activeChordWordLineIndexes(timeline.wordMarks, timeMs, timeline.lineMarks),
  ])].sort((left, right) => left - right)
  const wordPresentation = chordWordPresentation(timeline.wordMarks, timeMs)
  const instrumentalIndex = timeline.instrumentals.findIndex(interval => interval.startMs <= timeMs && timeMs < interval.endMs)
  return { timeMs, activeLines, wordPresentation, instrumentalIndex }
}

function signatureOf(snapshot: LyricPlaybackSnapshot): string {
  return JSON.stringify([
    snapshot.activeLines,
    snapshot.wordPresentation.active.map(word => [word.lineIndex, word.wordIndex]),
    snapshot.wordPresentation.completed.map(word => [word.lineIndex, word.wordIndex]),
    snapshot.instrumentalIndex,
  ])
}

export function useLyricPlayback({
  timeline,
  isPlaying,
  enabled,
  fallbackMs,
  seekVersion,
  getCurrentTime,
}: {
  timeline: ChordTimingTimeline
  isPlaying: boolean
  enabled: boolean
  fallbackMs: number
  seekVersion: number
  getCurrentTime: () => number
}) {
  const audioClock = useRef(getCurrentTime)
  audioClock.current = getCurrentTime
  const latestFallbackMs = useRef(fallbackMs)
  latestFallbackMs.current = fallbackMs
  const timelineRef = useRef(timeline)
  timelineRef.current = timeline
  const [snapshot, setSnapshot] = useState(() => sampleLyrics(timeline, fallbackMs))
  const signature = useMemo(() => signatureOf(snapshot), [snapshot])
  const signatureRef = useRef(signature)
  signatureRef.current = signature
  const seekVersionRef = useRef(seekVersion)
  const timelineVersionRef = useRef(timeline)

  useEffect(() => {
    const update = (timeMs: number) => {
      const next = sampleLyrics(timelineRef.current, timeMs)
      const nextSignature = signatureOf(next)
      const forced = seekVersionRef.current !== seekVersion || timelineVersionRef.current !== timeline || !isPlaying
      seekVersionRef.current = seekVersion
      timelineVersionRef.current = timeline
      if (nextSignature !== signatureRef.current || forced) {
        signatureRef.current = nextSignature
        setSnapshot(next)
      }
    }
    const seconds = !isPlaying ? audioClock.current() : Number.NaN
    update(Number.isFinite(seconds) ? seconds * 1000 : fallbackMs)
  }, [fallbackMs, isPlaying, seekVersion, timeline])

  useEffect(() => {
    if (!enabled || !isPlaying) return
    let frame = 0
    const tick = () => {
      const seconds = audioClock.current()
      const timeMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : latestFallbackMs.current
      const next = sampleLyrics(timelineRef.current, timeMs)
      const nextSignature = signatureOf(next)
      if (nextSignature !== signatureRef.current) {
        signatureRef.current = nextSignature
        setSnapshot(next)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [enabled, isPlaying, seekVersion, timeline])

  return snapshot
}

export function useLyricFrameUpdates({
  timeline,
  isPlaying,
  enabled,
  getCurrentTime,
  onFrame,
}: {
  timeline: ChordTimingTimeline
  isPlaying: boolean
  enabled: boolean
  getCurrentTime: () => number
  onFrame: (timeMs: number) => void
}) {
  const clockRef = useRef(getCurrentTime)
  clockRef.current = getCurrentTime
  const callbackRef = useRef(onFrame)
  callbackRef.current = onFrame

  useEffect(() => {
    if (!enabled || !isPlaying) return
    let frame = 0
    const tick = () => {
      const seconds = clockRef.current()
      if (Number.isFinite(seconds)) callbackRef.current(Math.max(0, seconds * 1000))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [enabled, isPlaying, timeline])
}
