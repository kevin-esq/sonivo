/**
 * Thin ChordPro detect + parse for Arrangement.Chords / Lyrics (ADR-0028).
 * Transpose (ADR-0030 P0) mutates chord tokens inside `[]` only.
 * Unknown directives are kept as soft display lines.
 */

/** Sharp-preferring chromatic names (Am +1 → A#m). Flats only when the source root used a flat. */
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
}

const ROOT_RE = /^([A-Ga-g][#b]?)(.*)$/

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

function normalizeRoot(raw: string): string {
  const letter = raw.charAt(0).toUpperCase()
  const accidental = raw.slice(1)
  return `${letter}${accidental}`
}

function transposeRoot(root: string, semitones: number): string {
  const idx = NOTE_INDEX[root]
  if (idx === undefined) return root
  const next = ((idx + semitones) % 12 + 12) % 12
  const preferFlat = root.length > 1 && root.endsWith('b')
  return (preferFlat ? FLAT_NAMES : SHARP_NAMES)[next]!
}

/**
 * Best-effort transpose of one chord token (e.g. `Am`, `F#maj7`, `G/B`).
 * Non-chord strings are returned unchanged.
 */
export function transposeChordToken(token: string, semitones: number): string {
  if (!token || semitones === 0) return token
  const trimmed = token.trim()
  if (!trimmed) return token

  const slash = trimmed.indexOf('/')
  if (slash >= 0) {
    const main = trimmed.slice(0, slash)
    const bass = trimmed.slice(slash + 1)
    return `${transposeChordToken(main, semitones)}/${transposeChordToken(bass, semitones)}`
  }

  const match = trimmed.match(ROOT_RE)
  if (!match) return token
  const root = normalizeRoot(match[1] ?? '')
  if (!(root in NOTE_INDEX)) return token
  const suffix = match[2] ?? ''
  const leadSpace = token.match(/^\s*/)?.[0] ?? ''
  const trailSpace = token.match(/\s*$/)?.[0] ?? ''
  return `${leadSpace}${transposeRoot(root, semitones)}${suffix}${trailSpace}`
}

function transposeBracketInner(inner: string, semitones: number): string {
  // Multiple space-separated chords in one bracket: `[Am G]`
  return inner
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? part : transposeChordToken(part, semitones)))
    .join('')
}

/**
 * Transpose ChordPro chord tokens inside `[]` by `semitones`.
 * Lyrics and `{…}` directives are left unchanged.
 */
export function transposeChordPro(text: string, semitones: number): string {
  if (!text || semitones === 0) return text
  return text.replace(/\[([^\]]*)\]/g, (_full, inner: string) => {
    return `[${transposeBracketInner(inner, semitones)}]`
  })
}

/**
 * Transpose a simple Arrangement.defaultKey when it is a single chord-like token
 * (e.g. `G`, `Am`, `F#m`). Returns `null` when the key is missing, blank, or
 * too complex to transpose safely — callers should omit defaultKey from PATCH.
 */
export function tryTransposeDefaultKey(
  key: string | null | undefined,
  semitones: number,
): string | null {
  if (key == null || semitones === 0) return null
  const trimmed = key.trim()
  if (!trimmed || /\s/.test(trimmed)) return null
  const match = trimmed.match(ROOT_RE)
  if (!match) return null
  const root = normalizeRoot(match[1] ?? '')
  if (!(root in NOTE_INDEX)) return null
  return transposeChordToken(trimmed, semitones)
}
