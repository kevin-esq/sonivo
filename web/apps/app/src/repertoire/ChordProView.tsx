import { useEffect, useRef } from 'react'
import { cn } from '../ui/cn'
import { useT } from '../i18n'
import { looksLikeChordPro, parseChordPro, type ChordProLine } from './chordPro'

/**
 * Known ChordPro section openers → the eyebrow shown in the lyric flow.
 * Every other directive (`{title:}`, `{key:}`, `{comment:}` values, unknown
 * `{...}`) is consumed silently so raw braces never leak into the lyrics.
 */
function sectionKey(name: string): 'chorus' | 'verse' | null {
  switch (name) {
    case 'soc':
    case 'start_of_chorus':
      return 'chorus'
    case 'sov':
    case 'start_of_verse':
      return 'verse'
    default:
      return null
  }
}

function ChordProLineView({
  line,
  hideChords,
}: {
  line: ChordProLine
  hideChords: boolean
}) {
  const { t } = useT()

  if (line.kind === 'empty') {
    return <div className="h-3" aria-hidden />
  }

  if (line.kind === 'comment') {
    return <p className="text-sm italic text-muted">{line.text}</p>
  }

  if (line.kind === 'directive') {
    const section = sectionKey(line.name)
    if (section == null) return null
    return (
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t(section === 'chorus' ? 'practice.chordpro.chorus' : 'practice.chordpro.verse')}
      </p>
    )
  }

  const hasChord =
    !hideChords && line.segments.some((s) => s.chord != null && s.chord.length > 0)

  return (
    <div className="flex flex-wrap items-end gap-x-0 leading-tight">
      {line.segments.map((segment, index) => (
        <span key={index} className="inline-block whitespace-pre">
          {hasChord ? (
            <span
              className="block min-h-[1.15em] text-sm font-semibold text-primary-ink"
              data-chord={segment.chord ?? undefined}
            >
              {segment.chord && segment.chord.length > 0 ? segment.chord : '\u00A0'}
            </span>
          ) : null}
          <span className="block text-base text-ink">
            {segment.lyric.length > 0 ? segment.lyric : '\u00A0'}
          </span>
        </span>
      ))}
    </div>
  )
}

export function ChordProView({
  text,
  testId,
  className,
  hideChords = false,
  activeLineIndex = null,
  activeBlockEndIndex = null,
}: {
  text: string
  testId?: string
  className?: string
  /** Vista Cantante: show lyrics only (ADR-0030 P0). */
  hideChords?: boolean
  /** ADR-0031: highlight this 0-based ChordPro line when following along. */
  activeLineIndex?: number | null
  /** ADR-0031 Q-SYNC-6: highlight contiguous block sharing the active mark. */
  activeBlockEndIndex?: number | null
}) {
  const doc = parseChordPro(text)
  const activeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (activeLineIndex == null) return
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeLineIndex])

  return (
    <div
      className={
        className ??
        'max-h-[min(70vh,40rem)] space-y-1 overflow-y-auto rounded-2xl bg-surface-hover p-5 font-sans'
      }
      data-testid={testId}
    >
      {doc.lines.map((line, index) => {
        const isActive = activeLineIndex != null && index >= activeLineIndex && index <= (activeBlockEndIndex ?? activeLineIndex)
        const isBlockStart = activeLineIndex === index
        return (
          <div
            key={index}
            ref={isBlockStart ? activeRef : undefined}
            data-line-index={index}
            data-active-line={isActive ? 'true' : undefined}
            className={cn(isActive && 'rounded-lg bg-primary/10 px-1 -mx-1 ring-1 ring-primary/30')}
          >
            <ChordProLineView line={line} hideChords={hideChords} />
          </div>
        )
      })}
    </div>
  )
}

/** Render ChordPro when detected; otherwise monospace plain text. */
export function RehearsalBodyView({
  text,
  chordProTestId,
  plainTestId,
  hideChords = false,
  activeLineIndex = null,
  activeBlockEndIndex = null,
}: {
  text: string
  chordProTestId: string
  plainTestId: string
  hideChords?: boolean
  activeLineIndex?: number | null
  activeBlockEndIndex?: number | null
}) {
  if (looksLikeChordPro(text)) {
    return (
      <ChordProView
        text={text}
        testId={chordProTestId}
        hideChords={hideChords}
        activeLineIndex={activeLineIndex}
        activeBlockEndIndex={activeBlockEndIndex}
      />
    )
  }
  return (
    <pre
      className="max-h-[min(70vh,40rem)] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-surface-hover p-5 font-sans text-base leading-relaxed text-ink"
      data-testid={plainTestId}
    >
      {text}
    </pre>
  )
}
