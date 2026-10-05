/**
 * Deterministic ChordPro composition assist (ADR-0030 P2).
 * Template/rules only — no cloud LLM.
 */

export type ComposeBrief = {
  genre: string
  key: string
  idea: string
}

const PROGRESSIONS: Record<string, string[][]> = {
  pop: [
    ['C', 'G', 'Am', 'F'],
    ['Am', 'F', 'C', 'G'],
    ['C', 'Am', 'F', 'G'],
  ],
  rock: [
    ['E', 'A', 'B', 'E'],
    ['A', 'D', 'E', 'A'],
    ['Em', 'C', 'G', 'D'],
  ],
  gospel: [
    ['C', 'F', 'G', 'C'],
    ['C', 'Am', 'Dm', 'G'],
    ['F', 'C', 'G', 'C'],
  ],
  balada: [
    ['C', 'Em', 'Am', 'F'],
    ['G', 'Em', 'C', 'D'],
    ['Am', 'G', 'F', 'E'],
  ],
  default: [
    ['C', 'G', 'Am', 'F'],
    ['Am', 'G', 'F', 'C'],
    ['G', 'Em', 'C', 'D'],
  ],
}

function normalizeGenre(genre: string): keyof typeof PROGRESSIONS {
  const g = genre.trim().toLowerCase()
  if (g.includes('rock')) return 'rock'
  if (g.includes('gospel') || g.includes('ador')) return 'gospel'
  if (g.includes('balad') || g.includes('ballad') || g.includes('lento')) return 'balada'
  if (g.includes('pop') || g.includes('latin')) return 'pop'
  return 'default'
}

function sanitizeKey(key: string): string {
  const k = key.trim()
  return k || 'C'
}

function sanitizeIdea(idea: string): string {
  const t = idea.trim().replace(/\s+/g, ' ')
  return t || 'una idea nueva'
}

function lineWithChords(chords: string[], words: string[]): string {
  const parts: string[] = []
  for (let i = 0; i < words.length; i++) {
    const chord = chords[i % chords.length]!
    parts.push(`[${chord}]${words[i]!}`)
  }
  return parts.join(' ')
}

function verseWords(idea: string, variant: number): string[] {
  const base = sanitizeIdea(idea)
  const seeds = [
    [base, 'en', 'el', 'camino'],
    ['hoy', 'cantamos', base],
    ['miramos', 'al', 'cielo', 'con', base],
  ]
  return seeds[variant % seeds.length]!
}

function chorusWords(idea: string, variant: number): string[] {
  const base = sanitizeIdea(idea)
  const seeds = [
    ['coro:', base, 'otra', 'vez'],
    ['levantamos', base],
    [base, 'para', 'siempre'],
  ]
  return seeds[variant % seeds.length]!
}

export function composeChordPro(
  brief: ComposeBrief,
  options?: { progressionIndex?: number; lyricVariant?: number },
): string {
  const genreKey = normalizeGenre(brief.genre)
  const progressions = PROGRESSIONS[genreKey]!
  const pIndex = (options?.progressionIndex ?? 0) % progressions.length
  const vIndex = options?.lyricVariant ?? 0
  const progression = progressions[pIndex]!
  const key = sanitizeKey(brief.key)
  const titleIdea = sanitizeIdea(brief.idea)

  const verse = lineWithChords(progression, verseWords(titleIdea, vIndex))
  const chorus = lineWithChords(progression, chorusWords(titleIdea, vIndex))

  return [
    `{title: ${titleIdea}}`,
    `{key: ${key}}`,
    `{comment: Género ${brief.genre.trim() || 'general'} · plantilla Sonivo · p${pIndex} · v${vIndex}}`,
    '{start_of_verse}',
    verse,
    '{end_of_verse}',
    '',
    '{start_of_chorus}',
    chorus,
    '{end_of_chorus}',
  ].join('\n')
}

function readTemplateMeta(current: string): { pIndex: number; vIndex: number } {
  const match = current.match(/plantilla Sonivo · p(\d+) · v(\d+)/i)
  return {
    pIndex: match ? Number(match[1]) : 0,
    vIndex: match ? Number(match[2]) : 0,
  }
}

/** Next progression template in the genre cycle. */
export function varyProgression(current: string, brief: ComposeBrief): string {
  const genreKey = normalizeGenre(brief.genre)
  const n = PROGRESSIONS[genreKey]!.length
  const { pIndex, vIndex } = readTemplateMeta(current)
  return composeChordPro(brief, { progressionIndex: (pIndex + 1) % n, lyricVariant: vIndex })
}

/** Rewrite verse/chorus lyric seeds; keep progression index. */
export function rewriteVerse(current: string, brief: ComposeBrief): string {
  const { pIndex, vIndex } = readTemplateMeta(current)
  return composeChordPro(brief, { progressionIndex: pIndex, lyricVariant: vIndex + 1 })
}
