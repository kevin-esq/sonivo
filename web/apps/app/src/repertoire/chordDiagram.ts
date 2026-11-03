/**
 * Chord diagram model. Fingerings are derived from the two standard movable
 * barre shapes (E-shape on the 6th string, A-shape on the 5th string) so any
 * root works without a hand-written chord dictionary, and without shipping a
 * multi-hundred-kilobyte voicing database to the browser.
 */

const PITCH_CLASS: Record<string, number> = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, 'E#': 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11,
}

/** Open tuning pitch classes, low E (6th) to high E (1st). */
const STRING_6_ROOT = 4
const STRING_5_ROOT = 9

type Shape = readonly [number, number, number, number, number, number]

/** Fret offsets from the barre: -1 muted, 0 barre/open, n barre + n. */
const E_SHAPES: Record<string, Shape> = {
  '': [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  '7': [0, 2, 0, 1, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  '6': [0, 2, 2, 1, 2, 0],
  m6: [0, 2, 2, 0, 2, 0],
  sus4: [0, 2, 2, 2, 0, 0],
  sus2: [0, 2, 4, 4, 0, 0],
  '7sus4': [0, 2, 0, 2, 0, 0],
  '9': [0, 2, 0, 1, 0, 2],
  m9: [0, 2, 0, 0, 0, 2],
  maj9: [0, 2, 1, 1, 0, 2],
  add9: [0, 2, 2, 1, 0, 2],
  '5': [0, 2, 2, -1, -1, -1],
}

const A_SHAPES: Record<string, Shape> = {
  '': [-1, 0, 2, 2, 2, 0],
  m: [-1, 0, 2, 2, 1, 0],
  '7': [-1, 0, 2, 0, 2, 0],
  maj7: [-1, 0, 2, 1, 2, 0],
  m7: [-1, 0, 2, 0, 1, 0],
  '6': [-1, 0, 2, 2, 2, 2],
  m6: [-1, 0, 2, 2, 1, 2],
  sus4: [-1, 0, 2, 2, 3, 0],
  sus2: [-1, 0, 2, 2, 0, 0],
  '7sus4': [-1, 0, 2, 0, 3, 0],
  '5': [-1, 0, 2, 2, -1, -1],
}

/** Raw (lowercased) suffix → canonical quality key, or `undefined` if unknown. */
const QUALITY_ALIASES: Record<string, string> = {
  '': '', maj: '', major: '',
  m: 'm', min: 'm', minor: 'm', mi: 'm',
  '7': '7', maj7: 'maj7', major7: 'maj7',
  m7: 'm7', min7: 'm7',
  '6': '6', maj6: '6',
  m6: 'm6', min6: 'm6',
  sus: 'sus4', sus4: 'sus4',
  sus2: 'sus2',
  '7sus4': '7sus4',
  '9': '9',
  m9: 'm9', min9: 'm9',
  maj9: 'maj9', major9: 'maj9',
  add9: 'add9',
  '5': '5',
}

export type ChordBarre = {
  /** Absolute fret of the barre. */
  fret: number
  /** Lowest barred string (0 = 6th string). */
  from: number
  /** Highest barred string (5 = 1st string). */
  to: number
}

export type ChordDiagram = {
  /** Normalized chord label. */
  chord: string
  /** Low E to high E: -1 muted, 0 open, otherwise the absolute fret. */
  frets: number[]
  /** First fret row shown; 1 means the nut is visible. */
  baseFret: number
  /** Fret rows to render. */
  fretCount: number
  /** Barre across a contiguous string run, or null when none is needed. */
  barre: ChordBarre | null
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12
}

/** `am`/`Cmin`/`Cmaj7/G` → `Am`/`Cm`/`Cmaj7`, or null when unrecognized. */
export function normalizeChord(token: string): { root: string; quality: string } | null {
  const trimmed = token.trim()
  if (!trimmed) return null
  const withoutBass = trimmed.split('/')[0] ?? ''
  const match = /^([A-Ga-g][#b]?)(.*)$/.exec(withoutBass)
  if (!match) return null
  const rawRoot = match[1] ?? ''
  const root = `${rawRoot.charAt(0).toUpperCase()}${rawRoot.slice(1)}`
  const quality = QUALITY_ALIASES[(match[2] ?? '').toLowerCase()]
  if (quality === undefined) return null
  return { root, quality }
}

/**
 * Barre span for a movable shape: the index finger runs from the lowest sounding
 * string to the highest string that sits on the barre fret. Returns null when the
 * run is a single string (a lone note is drawn as a dot, not a bar).
 */
function barreSpan(shape: Shape, barre: number): ChordBarre | null {
  if (barre <= 0) return null
  let from = -1
  let to = -1
  shape.forEach((offset, index) => {
    if (offset < 0) return
    if (from === -1) from = index
    if (offset === 0) to = index
  })
  if (from === -1 || to <= from) return null
  return { fret: barre, from, to }
}

export function buildChordDiagram(chord: string): ChordDiagram | null {
  const normalized = normalizeChord(chord)
  if (!normalized) return null
  const pitchClass = PITCH_CLASS[normalized.root]
  if (pitchClass === undefined) return null

  // Both movable shapes describe the same quality; keep whichever sits lowest on
  // the neck so A/G/E roots use open or low positions, and ties prefer the E-shape.
  const candidates: { shape: Shape; barre: number }[] = []
  const eShape = E_SHAPES[normalized.quality]
  const aShape = A_SHAPES[normalized.quality]
  if (eShape) candidates.push({ shape: eShape, barre: mod12(pitchClass - STRING_6_ROOT) })
  if (aShape) candidates.push({ shape: aShape, barre: mod12(pitchClass - STRING_5_ROOT) })
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.barre - b.barre)

  const { shape, barre } = candidates[0]!
  const frets = shape.map((offset) => {
    if (offset < 0) return -1
    if (offset === 0) return barre
    return barre + offset
  })

  const pressed = frets.filter((fret) => fret > 0)
  const minFret = pressed.length > 0 ? Math.min(...pressed) : 0
  const maxFret = pressed.length > 0 ? Math.max(...pressed) : 0
  const baseFret = minFret === 0 || maxFret <= 4 ? 1 : minFret
  const fretCount = Math.max(4, maxFret - baseFret + 1)

  return {
    chord: `${normalized.root}${normalized.quality}`,
    frets,
    baseFret,
    fretCount,
    barre: barreSpan(shape, barre),
  }
}
