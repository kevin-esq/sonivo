'use client'

import { memo, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { ChordProLine } from './chordPro'
import type { ChordWordTimingMark } from './chordTiming'
import { cn } from '../ui/cn'

type WordCursor = { lineIndex: number; wordIndex: number }

function SyncedLyricTextView({
  line,
  lineIndex,
  wordMarks,
  activeWord,
  completedWord,
  lineSeekMs,
  variant,
  showChords = false,
  showLyrics = true,
  focused = false,
  activeLine = false,
  isPlaying = false,
  getCurrentTime,
  onWordSeek,
  onLineSeek,
  wordLabel,
}: {
  line: ChordProLine
  lineIndex: number
  wordMarks: ChordWordTimingMark[]
  activeWord: (WordCursor & { progress: number }) | null
  completedWord: WordCursor | null
  lineSeekMs?: number | null
  variant: 'stage' | 'player'
  showChords?: boolean
  showLyrics?: boolean
  focused?: boolean
  activeLine?: boolean
  isPlaying?: boolean
  getCurrentTime?: () => number
  onWordSeek?: (seconds: number) => void
  onLineSeek?: (seconds: number) => void
  wordLabel?: (seconds: number, word: string) => string
}) {
  const lineMarks = useMemo(() => line.kind === 'lyric' ? wordMarks.filter(mark => mark.lineIndex === lineIndex) : [], [line.kind, lineIndex, wordMarks])
  const markByWord = useMemo(() => new Map(lineMarks.map(mark => [mark.wordIndex, mark])), [lineMarks])
  const lineElementRef = useRef<HTMLSpanElement>(null)
  const audioClock = useRef(getCurrentTime)
  audioClock.current = getCurrentTime
  const completedWordIndex = activeWord?.lineIndex === lineIndex
    ? activeWord.wordIndex - 1
    : completedWord?.lineIndex === lineIndex ? completedWord.wordIndex : -1
  const nearestTime = (index: number) => lineMarks.reduce<ChordWordTimingMark | null>((nearest, mark) =>
    nearest == null || Math.abs(mark.wordIndex - index) < Math.abs(nearest.wordIndex - index) ? mark : nearest, null)?.startMs
  let wordIndex = 0
  useEffect(() => {
    if (!isPlaying || !activeLine || !lineMarks.length || !getCurrentTime) return

    const words = new Map(Array.from(lineElementRef.current?.querySelectorAll<HTMLElement>('[data-synced-word]') ?? [], word => [Number(word.dataset.syncedWord), word]))
    let frame = 0
    const update = () => {
      const currentSeconds = audioClock.current?.()
      if (currentSeconds != null && Number.isFinite(currentSeconds)) {
        const currentMs = currentSeconds * 1000
        const mark = lineMarks.find(item => item.startMs <= currentMs && currentMs < item.endMs)
        for (const item of lineMarks) {
          const word = words.get(item.wordIndex)
          if (!word || item === mark) continue
          if (currentMs >= item.endMs) {
            const fade = Math.max(0, 1 - (currentMs - item.endMs) / 1800)
            word.style.color = `color-mix(in srgb, var(--brand-primary) ${38 + fade * 62}%, color-mix(in srgb, var(--brand-primary) 28%, var(--color-shell-foreground)))`
          } else {
            word.style.removeProperty('color')
          }
        }
        if (mark) {
          const progress = Math.max(0, Math.min(1, (currentMs - mark.startMs) / (mark.endMs - mark.startMs)))
          const word = words.get(mark.wordIndex)
          if (word) {
            word.style.backgroundPosition = `${100 - progress * 100}% 0`
            word.style.setProperty('--lyric-glow-radius', `${1.5 + progress * 3.5}px`)
            word.dataset.wordProgress = progress.toFixed(3)
          }
        }
      }
      frame = requestAnimationFrame(update)
    }

    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [isPlaying, activeLine, lineIndex, lineMarks, getCurrentTime])

  if (line.kind !== 'lyric') return null

  const hasChord = showChords && line.segments.some(segment => segment.chord)
  const lineText = line.segments.map(segment => segment.lyric).join('')
  const lineStartMs = lineSeekMs ?? lineMarks.reduce<number | null>((earliest, mark) => earliest == null ? mark.startMs : Math.min(earliest, mark.startMs), null)

  const content = <span ref={lineElementRef} data-lyric-line={lineIndex}>
    {line.segments.map((segment, segmentIndex) => <span key={segmentIndex} className="inline-block max-w-full whitespace-pre-wrap [overflow-wrap:anywhere]">
      {hasChord ? <span className="block font-semibold text-white" style={{ fontSize: '0.7em', color: 'color-mix(in srgb, var(--brand-primary) 58%, white)' }}>{segment.chord || '\u00A0'}</span> : null}
      {showLyrics ? <span className="block font-semibold text-white" style={focused && variant === 'stage' ? { textShadow: '0 2px 18px rgba(0,0,0,.12)' } : undefined}>
        {(segment.lyric.match(/\s+|\S+/g) ?? []).map((part, partIndex) => {
          if (/^\s+$/.test(part)) return <span key={`space-${partIndex}`}>{part}</span>
          const index = wordIndex++
          const mark = markByWord.get(index)
          const highlighted = activeWord?.lineIndex === lineIndex && activeWord.wordIndex === index
          const completed = index <= completedWordIndex
          const seekMs = mark?.startMs ?? lineSeekMs ?? nearestTime(index)
          const glowStyle = highlighted && activeWord ? { '--lyric-glow-radius': `${1.5 + activeWord.progress * 3.5}px` } as CSSProperties : undefined
          const style: CSSProperties | undefined = highlighted && activeWord
            ? variant === 'stage'
              ? {
                  ...glowStyle,
                  backgroundImage: 'linear-gradient(90deg, var(--brand-primary) 0%, var(--brand-primary) 38%, color-mix(in srgb, var(--brand-primary) 38%, white) 46%, color-mix(in srgb, var(--brand-primary) 38%, white) 49%, var(--color-shell-foreground) 60%, var(--color-shell-foreground) 100%)',
                  backgroundSize: '200% 100%',
                  backgroundPosition: `${100 - activeWord.progress * 100}% 0`,
                  backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent',
                }
              : {
                  ...glowStyle,
                  backgroundImage: 'linear-gradient(90deg, var(--brand-primary) 0%, var(--brand-primary) 46%, color-mix(in srgb, var(--brand-primary) 62%, white) 49%, color-mix(in srgb, var(--brand-primary) 62%, white) 51%, var(--color-shell-foreground) 55%, var(--color-shell-foreground) 100%)',
                  backgroundSize: '200% 100%',
                  backgroundPosition: `${100 - activeWord.progress * 100}% 0`,
                  color: 'transparent', backgroundClip: 'text', WebkitBackgroundClip: 'text',
                }
            : completed && (variant === 'stage' || activeLine)
              ? { color: 'var(--brand-primary)' }
              : undefined
          const word = <span
            className={cn('inline', highlighted && !getCurrentTime && 'transition-[background-position,color] duration-250 ease-linear motion-reduce:transition-none', completed && (variant === 'stage' || activeLine) && isPlaying && 'transition-colors duration-700 ease-out motion-reduce:transition-none', highlighted && 'lyrics-word-active')}
            data-synced-word={index}
            data-stage-word={variant === 'stage' ? index : undefined}
            data-word-completed={completed ? 'true' : undefined}
            data-word-progress={highlighted && activeWord ? activeWord.progress.toFixed(3) : undefined}
            style={style}
          >{part}</span>
          return variant === 'stage' && onWordSeek && seekMs != null
            ? <button key={`word-${index}`} type="button" aria-label={wordLabel?.(seekMs / 1000, part)} className="inline cursor-pointer rounded-sm border-0 bg-transparent p-0 text-left text-inherit hover:underline hover:decoration-[var(--brand-primary)] hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]" style={{ font: 'inherit', lineHeight: 'inherit' }} onClick={() => onWordSeek(seekMs / 1000)}>{word}</button>
            : <span key={`word-${index}`}>{word}</span>
        })}
      </span> : null}
    </span>)}
  </span>
  return variant === 'player' && onLineSeek && lineStartMs != null
    ? <button data-lyric-line-seek={lineIndex} type="button" aria-label={wordLabel?.(lineStartMs / 1000, lineText)} className="block w-full cursor-pointer border-0 bg-transparent p-0 text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]" style={{ font: 'inherit', lineHeight: 'inherit' }} onClick={() => onLineSeek(lineStartMs / 1000)}>{content}</button>
    : content
}

export const SyncedLyricText = memo(SyncedLyricTextView, (previous, next) => {
  const previousActive = previous.activeWord?.lineIndex === previous.lineIndex ? previous.activeWord : null
  const nextActive = next.activeWord?.lineIndex === next.lineIndex ? next.activeWord : null
  const previousCompleted = previous.completedWord?.lineIndex === previous.lineIndex ? previous.completedWord.wordIndex : null
  const nextCompleted = next.completedWord?.lineIndex === next.lineIndex ? next.completedWord.wordIndex : null
  return previous.line === next.line && previous.lineIndex === next.lineIndex && previous.wordMarks === next.wordMarks &&
    previousActive?.wordIndex === nextActive?.wordIndex && previousActive?.progress === nextActive?.progress &&
    previousCompleted === nextCompleted && previous.lineSeekMs === next.lineSeekMs && previous.variant === next.variant &&
    previous.showChords === next.showChords && previous.showLyrics === next.showLyrics && previous.focused === next.focused && previous.activeLine === next.activeLine && previous.isPlaying === next.isPlaying &&
    previous.onWordSeek === next.onWordSeek && previous.onLineSeek === next.onLineSeek && previous.wordLabel === next.wordLabel
})
