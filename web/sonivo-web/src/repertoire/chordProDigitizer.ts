/**
 * Deterministic ChordPro text digitizer (ADR-0030 P1).
 * No cloud LLM / Whisper — ordered chord list + plain lyrics → ChordPro.
 */

export type DigitizerSlot = {
  /** Lyric word (or syllable token after split). */
  text: string
  /** Chord token without brackets; null = no chord on this slot. */
  chord: string | null
}

export type DigitizerLine = {
  slots: DigitizerSlot[]
}

export type DigitizerDocument = {
  lines: DigitizerLine[]
}

/** Parse chord tokens from space / comma / newline separated input. */
export function parseChordList(input: string): string[] {
  if (!input.trim()) return []
  return input
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^\[|\]$/g, '').trim())
    .filter(Boolean)
}

/**
 * Split a lyric line into word slots (whitespace-separated).
 * Empty / whitespace-only lines become empty slot lists.
 */
export function splitLyricLine(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed) return []
  return trimmed.split(/\s+/)
}

/**
 * Build a digitizer document from plain lyrics with no chords placed yet.
 */
export function lyricsToDocument(lyrics: string): DigitizerDocument {
  const rawLines = lyrics.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  return {
    lines: rawLines.map((line) => ({
      slots: splitLyricLine(line).map((text) => ({ text, chord: null })),
    })),
  }
}

/**
 * Place chords deterministically onto successive lyric slots (left→right, top→bottom).
 * Extra chords stack on the last slot; extra slots stay chord-less.
 */
export function placeChordsOnDocument(
  doc: DigitizerDocument,
  chords: string[],
): DigitizerDocument {
  const flat: { lineIndex: number; slotIndex: number }[] = []
  for (let li = 0; li < doc.lines.length; li++) {
    const line = doc.lines[li]!
    for (let si = 0; si < line.slots.length; si++) {
      flat.push({ lineIndex: li, slotIndex: si })
    }
  }

  const next: DigitizerDocument = {
    lines: doc.lines.map((line) => ({
      slots: line.slots.map((slot) => ({ text: slot.text, chord: null as string | null })),
    })),
  }

  if (flat.length === 0) {
    // No lyric words — emit a single line of stacked chords if any.
    if (chords.length === 0) return next
    return {
      lines: [
        {
          slots: chords.map((chord, index) => ({
            text: index === chords.length - 1 ? '' : '',
            chord,
          })),
        },
      ],
    }
  }

  for (let i = 0; i < chords.length; i++) {
    const target = flat[Math.min(i, flat.length - 1)]!
    const slot = next.lines[target.lineIndex]!.slots[target.slotIndex]!
    if (slot.chord == null) {
      slot.chord = chords[i]!
    } else {
      // Stack extras onto the last occupied slot as separate zero-lyric slots before it.
      const line = next.lines[target.lineIndex]!
      line.slots.splice(target.slotIndex, 0, { text: '', chord: chords[i]! })
      // Keep flat indices coherent for subsequent stacks on same last word:
      for (let j = 0; j < flat.length; j++) {
        const f = flat[j]!
        if (f.lineIndex === target.lineIndex && f.slotIndex >= target.slotIndex) {
          f.slotIndex += 1
        }
      }
    }
  }

  return next
}

/**
 * Deterministic placer: plain lyrics + chord list → ChordPro text for Arrangement.Chords.
 */
export function digitizeToChordPro(lyrics: string, chordListInput: string): string {
  const chords = parseChordList(chordListInput)
  const doc = placeChordsOnDocument(lyricsToDocument(lyrics), chords)
  return serializeDigitizerDocument(doc)
}

/** Serialize digitizer document to ChordPro-compatible lines. */
export function serializeDigitizerDocument(doc: DigitizerDocument): string {
  return doc.lines
    .map((line) => {
      if (line.slots.length === 0) return ''
      return line.slots
        .map((slot) => {
          const chordPart = slot.chord != null && slot.chord !== '' ? `[${slot.chord}]` : ''
          return `${chordPart}${slot.text}`
        })
        .join(' ')
    })
    .join('\n')
}

/**
 * Parse ChordPro lyric lines (no directives) back into a digitizer document for the studio.
 * Directives / comments become empty lines (studio is for digitizer output).
 */
export function parseChordProToDigitizer(text: string): DigitizerDocument {
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const lines: DigitizerLine[] = rawLines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed) return { slots: [] }
    if (/^\{/.test(trimmed)) return { slots: [] }

    const slots: DigitizerSlot[] = []
    // Tokenize: optional [chord] prefixes then lyric chunk until next [ or whitespace boundary.
    const re = /(\[([^\]]*)\])|([^\s\[]+)/g
    let match: RegExpExecArray | null
    let pendingChord: string | null = null

    while ((match = re.exec(line)) !== null) {
      if (match[1] != null) {
        const chord = (match[2] ?? '').trim()
        if (pendingChord != null) {
          slots.push({ text: '', chord: pendingChord })
        }
        pendingChord = chord || null
      } else {
        const word = match[3] ?? ''
        slots.push({ text: word, chord: pendingChord })
        pendingChord = null
      }
    }
    if (pendingChord != null) {
      slots.push({ text: '', chord: pendingChord })
    }
    return { slots }
  })
  return { lines }
}

export type ChordCursor = {
  /** Index among slots that currently have a chord (0-based). */
  chordIndex: number
  lineIndex: number
  slotIndex: number
}

/** List all chord-bearing slots in document order. */
export function listChordCursors(doc: DigitizerDocument): ChordCursor[] {
  const cursors: ChordCursor[] = []
  let chordIndex = 0
  for (let li = 0; li < doc.lines.length; li++) {
    const line = doc.lines[li]!
    for (let si = 0; si < line.slots.length; si++) {
      const slot = line.slots[si]!
      if (slot.chord != null && slot.chord !== '') {
        cursors.push({ chordIndex, lineIndex: li, slotIndex: si })
        chordIndex += 1
      }
    }
  }
  return cursors
}

function cloneDocument(doc: DigitizerDocument): DigitizerDocument {
  return {
    lines: doc.lines.map((line) => ({
      slots: line.slots.map((s) => ({ text: s.text, chord: s.chord })),
    })),
  }
}

/**
 * Flatten slots that can receive a chord move (all slots with lyric text, plus
 * empty chord-only slots so stacking can unwrap).
 */
function flatSlotRefs(doc: DigitizerDocument): { lineIndex: number; slotIndex: number }[] {
  const refs: { lineIndex: number; slotIndex: number }[] = []
  for (let li = 0; li < doc.lines.length; li++) {
    const line = doc.lines[li]!
    for (let si = 0; si < line.slots.length; si++) {
      refs.push({ lineIndex: li, slotIndex: si })
    }
  }
  return refs
}

/**
 * Move the selected chord one slot left (−1) or right (+1) by lyric word/slot.
 * Returns a new document; no-op at edges.
 */
export function nudgeChord(
  doc: DigitizerDocument,
  chordIndex: number,
  direction: -1 | 1,
): DigitizerDocument {
  const cursors = listChordCursors(doc)
  const cursor = cursors.find((c) => c.chordIndex === chordIndex)
  if (!cursor) return doc

  const refs = flatSlotRefs(doc)
  const currentFlat = refs.findIndex(
    (r) => r.lineIndex === cursor.lineIndex && r.slotIndex === cursor.slotIndex,
  )
  if (currentFlat < 0) return doc

  const targetFlat = currentFlat + direction
  if (targetFlat < 0 || targetFlat >= refs.length) return doc

  const target = refs[targetFlat]!
  // Do not merge into a slot that already has a different chord — swap positions.
  const next = cloneDocument(doc)
  const fromSlot = next.lines[cursor.lineIndex]!.slots[cursor.slotIndex]!
  const toSlot = next.lines[target.lineIndex]!.slots[target.slotIndex]!
  const moving = fromSlot.chord
  fromSlot.chord = toSlot.chord
  toSlot.chord = moving
  return next
}
