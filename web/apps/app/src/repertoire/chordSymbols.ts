/**
 * Thin wrapper around `chord-symbol` (MIT, © Christophe Noël).
 *
 * Sonivo keeps its own conservative chord spelling and transpose rules
 * (`chordPro.ts`) because the ChordPro body is stored verbatim. This module only
 * adds what those helpers cannot do reliably: recognizing whether a token is a
 * real chord, reading its notes, and naming its scale degree in the arrangement
 * key. Recognition is intentionally tolerant — a lowercase root (`am`) is
 * normalized first — so it never flags input the editor already accepts.
 */
import { chordParserFactory } from 'chord-symbol'

type Parser = ReturnType<typeof chordParserFactory>

const parser = chordParserFactory()

/** chord-symbol wants an uppercase root; users frequently type `am` or `g/b`. */
function normalizeInput(token: string): string {
  const trimmed = token.trim()
  if (!trimmed) return ''
  const upperRoot = (part: string) => (part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part)
  const slash = trimmed.indexOf('/')
  if (slash < 0) return upperRoot(trimmed)
  return `${upperRoot(trimmed.slice(0, slash))}/${upperRoot(trimmed.slice(slash + 1))}`
}

const notesCache = new Map<string, string[] | null>()

/** Note names of a chord token, or `null` when it is not a chord. */
function notesFor(token: string): string[] | null {
  const input = normalizeInput(token)
  if (!input) return null
  const cached = notesCache.get(input)
  if (cached !== undefined) return cached

  let notes: string[] | null = null
  try {
    const parsed = parser(input)
    if (!('error' in parsed)) notes = parsed.normalized.notes
  } catch {
    notes = null
  }
  notesCache.set(input, notes)
  return notes
}

/** True when the token is a recognizable chord symbol. */
export function isChordSymbol(token: string): boolean {
  return notesFor(token) !== null
}

/** Note names of a chord token, or `[]` when it is not a chord. */
export function chordNotes(token: string): string[] {
  return notesFor(token) ?? []
}

const keyedParsers = new Map<string, Parser | null>()

function keyedParser(key: string): Parser | null {
  if (keyedParsers.has(key)) return keyedParsers.get(key) ?? null
  let created: Parser | null = null
  try {
    // chord-symbol accepts `C`, `C#m`, `Ab`… and throws on anything else.
    created = chordParserFactory({ key })
  } catch {
    created = null
  }
  keyedParsers.set(key, created)
  return created
}

/**
 * Roman-numeral degree of a chord in the arrangement key (`Am` in `C` → `vi`).
 * Returns `null` when the key is missing or the degree cannot be determined
 * (for example a chord foreign to the key).
 */
export function chordDegreeInKey(token: string, key: string | null | undefined): string | null {
  const trimmedKey = key?.trim()
  if (!trimmedKey) return null
  const normalizedKey = normalizeInput(trimmedKey)
  const input = normalizeInput(token)
  if (!normalizedKey || !input) return null

  const scoped = keyedParser(normalizedKey)
  if (!scoped) return null
  try {
    const parsed = scoped(input)
    if ('error' in parsed) return null
    const degree = parsed.numeral?.degree
    return degree && degree !== '?' ? degree : null
  } catch {
    return null
  }
}
