/**
 * Thin ChordPro detect + parse for Arrangement.Chords / Lyrics (ADR-0028).
 * Transpose (ADR-0030 P0) mutates chord tokens inside `[]` only.
 * Unknown directives are kept as soft display lines.
 *
 * Recognition of real chord tokens is delegated to `chordSymbols` (MIT
 * `chord-symbol`); the spelling/transpose rules here stay Sonivo-owned.
 */
import { isChordSymbol } from './chordSymbols'

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

const SCALES: Record<string, { intervals: number[]; qualities: string[] }> = {
  major: { intervals: [0, 2, 4, 5, 7, 9, 11], qualities: ['', 'm', 'm', '', '', 'm', 'dim'] },
  minor: { intervals: [0, 2, 3, 5, 7, 8, 10], qualities: ['m', 'dim', '', 'm', 'm', '', ''] },
}

/** Return basic in-key triads for the key signature entered in the Arrangement. */
export function chordSuggestionsForKey(key: string | null | undefined): string[] {
  const match = key?.trim().match(/^([A-Ga-g][#b]?)(.*)$/)
  if (!match) return []
  const root = normalizeRoot(match[1] ?? '')
  const tonic = NOTE_INDEX[root]
  if (tonic === undefined) return []

  const mode = /^\s*m(?:inor)?\s*$/i.test(match[2] ?? '') ? 'minor' : 'major'
  const scale = SCALES[mode]!
  const preferFlat = root.endsWith('b')
  const noteNames = preferFlat ? FLAT_NAMES : SHARP_NAMES
  return scale.intervals.map((interval, index) => `${noteNames[(tonic + interval) % 12]}${scale.qualities[index]}`)
}

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

export function isBackingVocalLine(line: ChordProLine): boolean {
  return line.kind === 'lyric' && /^\([^()]+\)$/.test(line.segments.map(segment => segment.lyric).join('').trim())
}

export function backingVocalParentLineIndex(lines: ChordProLine[], lineIndex: number): number | null {
  for (let index = lineIndex - 1; index >= 0; index--) {
    const line = lines[index]
    if (line?.kind === 'lyric' && !isBackingVocalLine(line)) return index
  }
  return null
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
  // Inline directives/comments never render: drop the braces (and keyword) so
  // raw `{...}` syntax cannot leak into the lyric flow (line-level directives
  // are consumed earlier in `parseLine`).
  const source = line.replace(/\{[^}]*\}/g, '')
  const re = /\[([^\]]*)\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(source)) !== null) {
    const before = source.slice(lastIndex, match.index)
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

  const trailing = source.slice(lastIndex)
  if (trailing) {
    if (segments.length === 0) {
      segments.push({ chord: null, lyric: trailing })
    } else {
      const prev = segments[segments.length - 1]!
      prev.lyric += trailing
    }
  }

  if (segments.length === 0) {
    return [{ chord: null, lyric: source }]
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

/* ------------------------------------------------------------------ */
/* Source editor: highlighting, completion, and syntax validation      */
/* ------------------------------------------------------------------ */

/** Directives the reader understands. Unknown `{name}` becomes a soft warning. */
const KNOWN_DIRECTIVES = new Set<string>([
  'album', 'artist', 'bridge', 'capo', 'cb', 'c', 'chorus', 'chordfont', 'chordsize',
  'ci', 'col', 'columns', 'comment', 'comment_box', 'comment_italic', 'composer',
  'copyright', 'cs', 'cf', 'duration', 'define', 'end_of_bridge', 'end_of_chorus',
  'end_of_grid', 'end_of_tab', 'end_of_verse', 'eob', 'eoc', 'eot', 'eov', 'g',
  'grid', 'highlight', 'image', 'key', 'label', 'labels', 'lyricist', 'margin',
  'musicpath', 'new_page', 'new_song', 'ng', 'no_grid', 'np', 'ns', 'pagesize',
  'pagetype', 'select', 'sorttitle', 'soc', 'sot', 'sov', 'start_of_bridge',
  'start_of_chorus', 'start_of_grid', 'start_of_tab', 'start_of_verse', 'st', 't',
  'tempo', 'textfont', 'textsize', 'tf', 'time', 'title', 'toc', 'transpose',
  'ts', 'verse', 'year',
])

/** `{c: ...}` and friends render as comments rather than structural directives. */
const COMMENT_DIRECTIVES = new Set(['c', 'comment', 'ci', 'comment_italic', 'cb', 'comment_box'])

export type ChordProSpanKind = 'text' | 'chord' | 'comment' | 'directive' | 'error'

export type ChordProSpan = {
  kind: ChordProSpanKind
  text: string
}

/** Split one source line into highlighted spans. Unclosed `[`/`{` become error spans. */
export function tokenizeChordProLine(line: string): ChordProSpan[] {
  const spans: ChordProSpan[] = []
  let plain = ''
  let index = 0

  const flush = () => {
    if (!plain) return
    spans.push({ kind: 'text', text: plain })
    plain = ''
  }

  while (index < line.length) {
    const char = line[index]
    if (char === '[') {
      const end = line.indexOf(']', index + 1)
      flush()
      if (end === -1) {
        spans.push({ kind: 'error', text: line.slice(index) })
        return spans
      }
      spans.push({ kind: 'chord', text: line.slice(index, end + 1) })
      index = end + 1
      continue
    }
    if (char === '{') {
      const end = line.indexOf('}', index + 1)
      flush()
      if (end === -1) {
        spans.push({ kind: 'error', text: line.slice(index) })
        return spans
      }
      const name = line.slice(index + 1, end).split(':')[0]?.trim().toLowerCase() ?? ''
      spans.push({ kind: COMMENT_DIRECTIVES.has(name) ? 'comment' : 'directive', text: line.slice(index, end + 1) })
      index = end + 1
      continue
    }
    plain += char
    index += 1
  }
  flush()
  return spans
}

export type ChordProIssueCode =
  | 'unclosedChord'
  | 'unexpectedChordClose'
  | 'unclosedDirective'
  | 'unexpectedDirectiveClose'
  | 'emptyChord'
  | 'unknownDirective'
  | 'unexpectedSectionEnd'
  | 'unclosedSection'
  | 'duplicateMetadata'
  | 'nonCanonicalChord'
  | 'unrecognizedChord'

/**
 * Tokens that look like a chord attempt (root A–G plus chord-ish characters) but
 * are not arbitrary markers like `N.C.`, `D.C.`, `x2` or `%`. Used so the
 * validator can flag real typos without warning on customary notation.
 */
const CHORD_LIKE_TOKEN = /^[A-Ga-g][#b]?[A-Za-z0-9+#b()/]{0,7}$/

/** `{start_of_x}` / `{sx}` shorthand to a canonical section name. */
const SECTION_STARTS: Record<string, string> = {
  start_of_verse: 'verse',
  sov: 'verse',
  start_of_chorus: 'chorus',
  soc: 'chorus',
  start_of_bridge: 'bridge',
  sob: 'bridge',
  start_of_tab: 'tab',
  sot: 'tab',
  start_of_grid: 'grid',
}

/** `{end_of_x}` / `{ex}` shorthand to a canonical section name. */
const SECTION_ENDS: Record<string, string> = {
  end_of_verse: 'verse',
  eov: 'verse',
  end_of_chorus: 'chorus',
  eoc: 'chorus',
  end_of_bridge: 'bridge',
  eob: 'bridge',
  end_of_tab: 'tab',
  eot: 'tab',
  end_of_grid: 'grid',
}

export type ChordProIssue = {
  /** 1-based line number. */
  line: number
  /** 1-based column of the offending character. */
  column: number
  severity: 'error' | 'warning'
  code: ChordProIssueCode
  /** Directive name for `unknownDirective`. */
  detail?: string
}

/** Directives that should appear at most once per song. */
const SINGLE_VALUE_METADATA = new Set<string>([
  'title', 't', 'artist', 'composer', 'lyricist', 'album', 'year', 'key',
  'tempo', 'capo', 'time', 'duration', 'copyright', 'sorttitle', 'label',
])

/** Suffixes the canonicalizer understands; anything else is treated as lyric text. */
const KNOWN_CHORD_QUALITIES = new Set<string>([
  '', 'm', 'min', 'minor', 'mi', 'maj', 'major', 'dim', 'aug', 'sus', 'sus2',
  'sus4', 'add9', '5', '6', '7', '9', '11', '13', 'm6', 'm7', 'm9', 'm11',
  'm13', 'maj7', 'maj9', 'm7b5', '7b5', 'dim7', 'aug7', '69', '7sus4',
])

function canonicalChordPart(value: string): string | null {
  const match = /^([A-Ga-g][#b]?)(.*)$/.exec(value)
  if (!match) return null
  const rawRoot = match[1] ?? ''
  const root = `${rawRoot.charAt(0).toUpperCase()}${rawRoot.slice(1)}`
  const rawSuffix = match[2] ?? ''
  if (!KNOWN_CHORD_QUALITIES.has(rawSuffix.toLowerCase())) return null
  const suffix = rawSuffix.toLowerCase()
  const mapped = suffix === 'min' || suffix === 'minor' || suffix === 'mi'
    ? 'm'
    : suffix === 'maj' || suffix === 'major' ? '' : suffix
  return `${root}${mapped}`
}

/**
 * Canonical spelling of a chord token (`am` → `Am`, `Cmin` → `Cm`), or `null`
 * when the token is already canonical or is not a recognizable chord.
 */
export function canonicalChordToken(token: string): string | null {
  const trimmed = token.trim()
  if (!trimmed) return null
  const slash = trimmed.indexOf('/')
  const main = slash >= 0 ? trimmed.slice(0, slash) : trimmed
  const bass = slash >= 0 ? trimmed.slice(slash + 1) : ''
  const canonicalMain = canonicalChordPart(main)
  const canonicalBass = bass ? canonicalChordPart(bass) : null
  if (canonicalMain === null && canonicalBass === null) return null
  const result = `${canonicalMain ?? main}${bass ? `/${canonicalBass ?? bass}` : ''}`
  return result === trimmed ? null : result
}

/**
 * Structural ChordPro check: unbalanced brackets/braces, empty `[]`, unknown
 * directives, unclosed sections, repeated single-value metadata, and
 * non-canonical chord spellings. It never rewrites the source; callers map the
 * codes to localized copy.
 */
export function validateChordProSource(text: string): ChordProIssue[] {
  const issues: ChordProIssue[] = []
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const openSections: Array<{ name: string; line: number; column: number }> = []
  const seenMetadata = new Map<string, number>()

  lines.forEach((line, lineIndex) => {
    let chordStart = -1
    let directiveStart = -1

    for (let column = 0; column < line.length; column += 1) {
      const char = line[column]

      if (chordStart >= 0) {
        if (char === ']') {
          const inner = line.slice(chordStart + 1, column)
          if (column === chordStart + 1) {
            issues.push({ line: lineIndex + 1, column: chordStart + 1, severity: 'warning', code: 'emptyChord' })
          } else {
            for (const token of inner.trim().split(/\s+/)) {
              const canonical = canonicalChordToken(token)
              if (canonical) {
                issues.push({ line: lineIndex + 1, column: chordStart + 1, severity: 'warning', code: 'nonCanonicalChord', detail: canonical })
              } else if (CHORD_LIKE_TOKEN.test(token) && !isChordSymbol(token)) {
                issues.push({ line: lineIndex + 1, column: chordStart + 1, severity: 'warning', code: 'unrecognizedChord', detail: token })
              }
            }
          }
          chordStart = -1
        }
        continue
      }

      if (directiveStart >= 0) {
        if (char === '}') {
          const inner = line.slice(directiveStart + 1, column)
          const separator = inner.indexOf(':')
          const name = (separator >= 0 ? inner.slice(0, separator) : inner).trim().toLowerCase()
          const value = separator >= 0 ? inner.slice(separator + 1).trim() : ''
          if (name && !KNOWN_DIRECTIVES.has(name) && !name.startsWith('x_')) {
            issues.push({ line: lineIndex + 1, column: directiveStart + 1, severity: 'warning', code: 'unknownDirective', detail: name })
          }
          if (name && value && SINGLE_VALUE_METADATA.has(name)) {
            const firstLine = seenMetadata.get(name)
            if (firstLine !== undefined) {
              issues.push({ line: lineIndex + 1, column: directiveStart + 1, severity: 'warning', code: 'duplicateMetadata', detail: name })
            } else {
              seenMetadata.set(name, lineIndex + 1)
            }
          }
          const closing = SECTION_ENDS[name]
          if (closing) {
            const top = openSections[openSections.length - 1]
            if (top?.name === closing) openSections.pop()
            else issues.push({ line: lineIndex + 1, column: directiveStart + 1, severity: 'warning', code: 'unexpectedSectionEnd', detail: closing })
          } else {
            const opening = SECTION_STARTS[name]
            if (opening) openSections.push({ name: opening, line: lineIndex + 1, column: directiveStart + 1 })
          }
          directiveStart = -1
        }
        continue
      }

      if (char === '[') chordStart = column
      else if (char === ']') issues.push({ line: lineIndex + 1, column: column + 1, severity: 'error', code: 'unexpectedChordClose' })
      else if (char === '{') directiveStart = column
      else if (char === '}') issues.push({ line: lineIndex + 1, column: column + 1, severity: 'error', code: 'unexpectedDirectiveClose' })
    }

    if (chordStart >= 0) issues.push({ line: lineIndex + 1, column: chordStart + 1, severity: 'error', code: 'unclosedChord' })
    if (directiveStart >= 0) issues.push({ line: lineIndex + 1, column: directiveStart + 1, severity: 'error', code: 'unclosedDirective' })
  })

  for (const section of openSections) {
    issues.push({ line: section.line, column: section.column, severity: 'warning', code: 'unclosedSection', detail: section.name })
  }

  return issues
}

/** Chord tokens already used in the source, split out of `[Am G]` groups. */
export function existingChordTokens(text: string): string[] {
  const tokens: string[] = []
  const re = /\[([^\]]*)\]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const inner = (match[1] ?? '').trim()
    if (inner) tokens.push(...inner.split(/\s+/))
  }
  return tokens
}

/**
 * The chord token the caret currently sits in, i.e. the text after the nearest
 * unclosed `[` on the same line. Returns `null` when the caret is outside a bracket.
 */
export function chordContextAt(text: string, cursor: number): { start: number; partial: string } | null {
  const bounded = Math.max(0, Math.min(cursor, text.length))
  const lineStart = text.lastIndexOf('\n', Math.max(0, bounded - 1)) + 1
  const open = text.lastIndexOf('[', Math.max(0, bounded - 1))
  if (open < lineStart) return null
  const close = text.indexOf(']', open + 1)
  if (close !== -1 && close < bounded) return null
  return { start: open + 1, partial: text.slice(open + 1, bounded) }
}

const CHORD_SUFFIXES = ['', 'm', '7', 'maj7', 'm7', 'm6', 'm7b5', 'dim', 'aug', 'sus2', 'sus4', 'add9', '6', '9', 'm9', '11', '13']

const NOTE_SPELLINGS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']

/**
 * Chord name completions for the token being typed. In-key suggestions come
 * first, then chords already present, then a generated root/suffix pool.
 * Supports slash chords (`Am/G`) by completing the bass note too.
 */
export function chordCompletionCandidates(
  partial: string,
  options: { key?: string | null; existing?: string[]; limit?: number } = {},
): string[] {
  const trimmed = partial.trim()
  if (!trimmed) return []
  const limit = options.limit ?? 8
  const needle = trimmed.toLowerCase()

  const pool: string[] = [...chordSuggestionsForKey(options.key), ...(options.existing ?? [])]
  for (const note of NOTE_SPELLINGS) {
    for (const suffix of CHORD_SUFFIXES) {
      pool.push(`${note}${suffix}`)
    }
  }

  const seen = new Set<string>()
  const matches: string[] = []
  const push = (candidate: string) => {
    const normalized = candidate.toLowerCase()
    if (seen.has(normalized)) return
    seen.add(normalized)
    matches.push(candidate)
  }

  const slashIndex = needle.indexOf('/')
  if (slashIndex >= 0) {
    const mainNeedle = needle.slice(0, slashIndex)
    const bassNeedle = needle.slice(slashIndex + 1)
    const mains = pool.filter((candidate) => candidate.toLowerCase().startsWith(mainNeedle))
    const basses = NOTE_SPELLINGS.filter((note) => note.toLowerCase().startsWith(bassNeedle))
    for (const main of mains) {
      for (const bass of basses) {
        push(`${main}/${bass}`)
        if (matches.length >= limit) return matches
      }
    }
    return matches
  }

  for (const candidate of pool) {
    const normalized = candidate.toLowerCase()
    if (normalized.startsWith(needle) && normalized !== needle) push(candidate)
    if (matches.length >= limit) break
  }
  return matches
}
