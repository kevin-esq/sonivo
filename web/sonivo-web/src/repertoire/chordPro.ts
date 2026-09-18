/**
 * Thin ChordPro detect + parse for Arrangement.Chords / Lyrics (ADR-0028).
 * No transpose engine; unknown directives are kept as soft display lines.
 */

export type ChordProSegment = {
  /** Chord token without brackets; null = lyric-only chunk. */
  chord: string | null
  lyric: string
}

export type ChordProLine =
  | { kind: 'empty' }
  | { kind: 'directive'; name: string; value: string | null }
  | { kind: 'comment'; text: string }
  | { kind: 'lyric'; segments: ChordProSegment[] }

export type ChordProDocument = {
  lines: ChordProLine[]
}

const CHORD_BRACKET = /\[[^\]]+\]/
const DIRECTIVE_BRACE = /\{[^}]+\}/

/** True when text looks like ChordPro (`[` chords or `{` directives). */
export function looksLikeChordPro(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  return CHORD_BRACKET.test(trimmed) || DIRECTIVE_BRACE.test(trimmed)
}

/**
 * Parse ChordPro-compatible text into chords-over-lyrics lines.
 * Directives and comments are preserved as structural lines; chord tokens
 * become segments with optional lyric text underneath.
 */
export function parseChordPro(text: string): ChordProDocument {
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const lines: ChordProLine[] = rawLines.map(parseLine)
  return { lines }
}

function parseLine(line: string): ChordProLine {
  const trimmed = line.trim()
  if (!trimmed) return { kind: 'empty' }

  const directiveMatch = trimmed.match(/^\{([^}:]+)(?::\s*(.*))?\}$/)
  if (directiveMatch) {
    const name = (directiveMatch[1] ?? '').trim().toLowerCase()
    const value = directiveMatch[2]?.trim() ?? null
    if (name === 'c' || name === 'comment') {
      return { kind: 'comment', text: value ?? '' }
    }
    return { kind: 'directive', name, value: value || null }
  }

  return { kind: 'lyric', segments: parseLyricSegments(line) }
}

function parseLyricSegments(line: string): ChordProSegment[] {
  const segments: ChordProSegment[] = []
  const re = /\[([^\]]*)\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(line)) !== null) {
    const before = line.slice(lastIndex, match.index)
    if (before) {
      if (segments.length === 0) {
        segments.push({ chord: null, lyric: before })
      } else {
        const prev = segments[segments.length - 1]!
        prev.lyric += before
      }
    }
    segments.push({ chord: match[1] ?? '', lyric: '' })
    lastIndex = match.index + match[0].length
  }

  const trailing = line.slice(lastIndex)
  if (trailing) {
    if (segments.length === 0) {
      segments.push({ chord: null, lyric: trailing })
    } else {
      const prev = segments[segments.length - 1]!
      prev.lyric += trailing
    }
  }

  if (segments.length === 0) {
    return [{ chord: null, lyric: line }]
  }
  return segments
}
