export type HarmonyChordSlot = { chord: string; durationTicks: number }

export type HarmonySection = {
  id: string
  name: string
  bars: HarmonyChordSlot[][]
}

export type HarmonyTrack = {
  id: string
  instrument: 'chord' | 'piano' | 'lead' | 'bass' | 'guitar' | 'drums'
  enabled: boolean
  pattern: 'sustain' | 'accompaniment' | 'rhythm'
  volume: number
}

export type HarmonyProgression = {
  version: 1
  scale: string
  meter: { numerator: number; denominator: number }
  genre: string
  sections: HarmonySection[]
  tracks: HarmonyTrack[]
}

export const HARMONY_SCALES = [
  'major', 'natural-minor', 'harmonic-minor', 'melodic-minor',
  'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'major-pentatonic', 'minor-pentatonic', 'blues',
] as const

const SCALE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  'natural-minor': [0, 2, 3, 5, 7, 8, 10],
  'harmonic-minor': [0, 2, 3, 5, 7, 8, 11],
  'melodic-minor': [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  'major-pentatonic': [0, 2, 4, 7, 9],
  'minor-pentatonic': [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
}

const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const NOTE_INDEX: Record<string, number> = { C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11 }

export function createHarmonyProgression(defaultSectionName = 'Verse'): HarmonyProgression {
  return {
    version: 1,
    scale: 'major',
    meter: { numerator: 4, denominator: 4 },
    genre: 'pop',
    sections: [{ id: newId(), name: defaultSectionName, bars: Array.from({ length: 4 }, () => []) }],
    tracks: [
      { id: newId(), instrument: 'chord', enabled: true, pattern: 'sustain', volume: 0.8 },
      { id: newId(), instrument: 'piano', enabled: true, pattern: 'accompaniment', volume: 0.8 },
      { id: newId(), instrument: 'lead', enabled: false, pattern: 'accompaniment', volume: 0.65 },
      { id: newId(), instrument: 'bass', enabled: true, pattern: 'accompaniment', volume: 0.8 },
      { id: newId(), instrument: 'guitar', enabled: false, pattern: 'accompaniment', volume: 0.75 },
      { id: newId(), instrument: 'drums', enabled: true, pattern: 'rhythm', volume: 0.8 },
    ],
  }
}

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function parseHarmonyProgression(raw: string | null | undefined, defaultSectionName = 'Verse'): HarmonyProgression {
  if (!raw) return createHarmonyProgression(defaultSectionName)
  try {
    const value = JSON.parse(raw) as Partial<HarmonyProgression>
    if (value.version !== 1 || !Array.isArray(value.sections) || !value.meter) return createHarmonyProgression(defaultSectionName)
    const sections = value.sections.filter(section => section && typeof section.id === 'string' && typeof section.name === 'string' && Array.isArray(section.bars)).map(section => ({
      id: section.id,
      name: section.name.slice(0, 64),
      bars: section.bars.slice(0, 64).map(bar => Array.isArray(bar) ? bar.filter(slot => slot && typeof slot.chord === 'string').map(slot => ({ chord: slot.chord.slice(0, 24), durationTicks: clampInt(slot.durationTicks, 1, 192, 4) })).slice(0, 16) : []),
    })).slice(0, 32)
    return {
      version: 1,
      scale: HARMONY_SCALES.includes(value.scale as typeof HARMONY_SCALES[number]) ? value.scale! : 'major',
      meter: { numerator: clampInt(value.meter.numerator, 1, 12, 4), denominator: [2, 4, 8, 16].includes(value.meter.denominator) ? value.meter.denominator : 4 },
      genre: typeof value.genre === 'string' ? value.genre.slice(0, 64) : 'pop',
      sections: sections.length ? sections : createHarmonyProgression(defaultSectionName).sections,
      tracks: Array.isArray(value.tracks) ? value.tracks.filter(track => track && typeof track.id === 'string' && ['chord', 'piano', 'lead', 'bass', 'guitar', 'drums'].includes(track.instrument)).map(track => ({
        id: track.id,
        instrument: track.instrument,
        enabled: Boolean(track.enabled),
        pattern: ['sustain', 'accompaniment', 'rhythm'].includes(track.pattern) ? track.pattern : 'sustain',
        volume: typeof track.volume === 'number' ? Math.max(0, Math.min(1, track.volume)) : 0.8,
      })) : [],
    }
  } catch {
    return createHarmonyProgression(defaultSectionName)
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback
}

export function serializeHarmonyProgression(value: HarmonyProgression) {
  return JSON.stringify(value)
}

export function barDurationTicks(meter: HarmonyProgression['meter']) {
  return meter.numerator * 16 / meter.denominator
}

export function harmonyChordsForScale(key: string, scale: string) {
  const match = key.trim().match(/^([A-G](?:#|b|♯|♭)?)/i)?.[1]
  const note = match?.replace('♭', 'b').replace('♯', '#')
  const root = note ? NOTE_INDEX[note[0]!.toUpperCase() + note.slice(1)] : undefined
  const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major
  if (root == null || intervals.length < 3) return []
  return intervals.map((degree, index) => {
    const third = intervals[(index + 2) % intervals.length]! + (index + 2 >= intervals.length ? 12 : 0)
    const fifth = intervals[(index + 4) % intervals.length]! + (index + 4 >= intervals.length ? 12 : 0)
    const thirdSize = third - degree
    const fifthSize = fifth - degree
    const quality = thirdSize === 3 && fifthSize === 6 ? 'dim' : thirdSize === 3 ? 'm' : ''
    return { degree: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][index] ?? String(index + 1), chord: `${NOTES[(root + degree) % 12]}${quality}` }
  })
}

export function normalizeKeySignature(value: string) {
  const match = value.trim().match(/^([A-G](?:#|b|♯|♭)?)/i)?.[1]
  const note = match?.replace('♯', '#').replace('♭', 'b')
  const pitch = note ? NOTE_INDEX[note[0]!.toUpperCase() + note.slice(1)] : undefined
  return pitch == null ? 'C' : NOTES[pitch]!
}
