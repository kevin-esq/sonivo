/** ADR-0031 / Q-SYNC-3: Owner-authored ChordPro line timing marks. */

export type ChordTimingMark = {
  lineIndex: number
  atMs: number
}

/** Split ChordPro body the same way the mark editor and parser do. */
export function splitChordProLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

/** Sort marks by atMs ascending, then lineIndex ascending (stable tie-break). */
function sortChordTimingMarks(marks: ChordTimingMark[]): ChordTimingMark[] {
  return [...marks].sort((a, b) => a.atMs - b.atMs || a.lineIndex - b.lineIndex)
}

/**
 * Parse Arrangement.chordTimingJson. Invalid / empty → [].
 * Duplicate lineIndex: last entry in array wins (matches API thin rule).
 */
export function parseChordTimingJson(raw: string | null | undefined): ChordTimingMark[] {
  if (raw == null || !raw.trim() || raw.trim() === '[]') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const byLine = new Map<number, number>()
    for (const item of parsed) {
      if (item == null || typeof item !== 'object') continue
      const lineIndex = (item as { lineIndex?: unknown }).lineIndex
      const atMs = (item as { atMs?: unknown }).atMs
      if (typeof lineIndex !== 'number' || !Number.isInteger(lineIndex) || lineIndex < 0) continue
      if (typeof atMs !== 'number' || !Number.isInteger(atMs) || atMs < 0) continue
      byLine.set(lineIndex, atMs)
    }
    return sortChordTimingMarks(
      [...byLine.entries()].map(([lineIndex, atMs]) => ({ lineIndex, atMs }))
    )
  } catch {
    return []
  }
}

/** Serialize marks for PATCH. Empty → "[]" (API clears to null). */
export function serializeChordTimingJson(marks: ChordTimingMark[]): string {
  if (marks.length === 0) return '[]'
  return JSON.stringify(sortChordTimingMarks(marks))
}

/**
 * Active line for follow-along: last mark whose atMs ≤ currentMs.
 * Returns null when no mark has started yet or marks are empty.
 */
export function activeChordLineIndex(
  marks: ChordTimingMark[],
  currentMs: number,
): number | null {
  if (marks.length === 0 || !Number.isFinite(currentMs) || currentMs < 0) return null
  const sorted = sortChordTimingMarks(marks)
  let active: number | null = null
  for (const mark of sorted) {
    if (mark.atMs <= currentMs) active = mark.lineIndex
    else break
  }
  return active
}

/**
 * Active line **or block** for follow-along (Q-SYNC-6).
 * Returns { lineIndex, blockEndIndex } where blockEndIndex is the last
 * contiguous line that shares the active mark's atMs.
 * Only lines that have a mark with the same atMs and are contiguous (no gaps in lineIndex
 * among marked lines) are included in the block. If no mark has started, returns null.
 */
export function activeChordLineBlock(
  marks: ChordTimingMark[],
  currentMs: number,
): { lineIndex: number; blockEndIndex: number } | null {
  if (marks.length === 0 || !Number.isFinite(currentMs) || currentMs < 0) return null
  const sorted = sortChordTimingMarks(marks)
  let activeLineIndex: number | null = null
  let activeMarkAtMs: number | null = null

  for (const mark of sorted) {
    if (mark.atMs <= currentMs) {
      activeLineIndex = mark.lineIndex
      activeMarkAtMs = mark.atMs
    } else break
  }

  if (activeLineIndex == null || activeMarkAtMs == null) return null

  // Find the last **contiguous** line that shares this same active mark's atMs
  // Only lines that have a mark with the same atMs are considered part of the block.
  // A gap in lineIndex (a line without a mark) breaks the block.
  let blockEndIndex = activeLineIndex
  for (let i = 0; i < sorted.length; i++) {
    const mark = sorted[i]
    if (mark.atMs === activeMarkAtMs) {
      if (mark.lineIndex === blockEndIndex || mark.lineIndex === blockEndIndex + 1) {
        blockEndIndex = mark.lineIndex
      } else {
        // Non-contiguous line with same atMs — stop looking
        break
      }
    }
  }

  return { lineIndex: activeLineIndex, blockEndIndex }
}

export function upsertChordTimingMark(
  marks: ChordTimingMark[],
  lineIndex: number,
  atMs: number,
): ChordTimingMark[] {
  const next = marks.filter((m) => m.lineIndex !== lineIndex)
  next.push({ lineIndex, atMs })
  return sortChordTimingMarks(next)
}

export function clearChordTimingMark(
  marks: ChordTimingMark[],
  lineIndex: number,
): ChordTimingMark[] {
  return marks.filter((m) => m.lineIndex !== lineIndex)
}
