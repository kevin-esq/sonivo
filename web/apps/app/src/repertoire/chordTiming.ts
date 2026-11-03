/** ADR-0031 / Q-SYNC-3: Owner-authored ChordPro line timing marks. */

export type ChordTimingMark = {
  lineIndex: number
  atMs: number
  endMs?: number
}

export type ChordWordTimingMark = {
  lineIndex: number
  wordIndex: number
  startMs: number
  endMs: number
}

const displayWordMarkCache = new WeakMap<ChordWordTimingMark[], ChordWordTimingMark[]>()

/** Spread missing lyric words only across explicit, time-bounded gaps for display. */
export function fillWordTimingGapsForDisplay(marks: ChordWordTimingMark[]): ChordWordTimingMark[] {
  const cached = displayWordMarkCache.get(marks)
  if (cached) return cached

  const byLine = new Map<number, ChordWordTimingMark[]>()
  for (const mark of marks) {
    const line = byLine.get(mark.lineIndex) ?? []
    line.push(mark)
    byLine.set(mark.lineIndex, line)
  }

  const inferred: ChordWordTimingMark[] = []
  for (const [lineIndex, line] of byLine) {
    line.sort((left, right) => left.wordIndex - right.wordIndex)
    for (let index = 1; index < line.length; index++) {
      const previous = line[index - 1]!
      const next = line[index]!
      const missingWords = next.wordIndex - previous.wordIndex - 1
      const gapMs = next.startMs - previous.endMs
      if (missingWords < 1 || gapMs <= 0) continue
      for (let offset = 0; offset < missingWords; offset++) {
        inferred.push({
          lineIndex,
          wordIndex: previous.wordIndex + offset + 1,
          startMs: previous.endMs + gapMs * offset / missingWords,
          endMs: previous.endMs + gapMs * (offset + 1) / missingWords,
        })
      }
    }
  }

  const result = inferred.length
    ? [...marks, ...inferred].sort((left, right) => left.startMs - right.startMs || left.lineIndex - right.lineIndex || left.wordIndex - right.wordIndex)
    : marks
  displayWordMarkCache.set(marks, result)
  return result
}

export type InstrumentalTimingInterval = {
  type: 'instrumental'
  startMs: number
  endMs: number
}

export type ChordTimingTimeline = {
  lineMarks: ChordTimingMark[]
  wordMarks: ChordWordTimingMark[]
  instrumentals: InstrumentalTimingInterval[]
}

export function isBackingVocalVisible(
  lineIndex: number,
  parentLineIndex: number | null,
  activeLineIndexes: number[],
  hasOwnMarks: boolean,
  followLyrics: boolean,
  hasMarks: boolean,
): boolean {
  if (!followLyrics || !hasMarks) return true
  if (activeLineIndexes.includes(lineIndex)) return true
  return !hasOwnMarks && parentLineIndex != null && activeLineIndexes.includes(parentLineIndex)
}

type ChordTimingEntry = ChordTimingMark | ChordWordTimingMark | InstrumentalTimingInterval

export const EMPTY_CHORD_TIMELINE: ChordTimingTimeline = {
  lineMarks: [],
  wordMarks: [],
  instrumentals: [],
}

export function formatChordTimestamp(milliseconds: number): string {
  const seconds = milliseconds / 1000
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds - minutes * 60
  const precision = milliseconds % 1000 === 0 ? 0 : 1
  return `${minutes}:${remainder.toFixed(precision).padStart(precision ? 4 : 2, '0')}`
}

export function parseChordTimestamp(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(value.trim())
  if (!match) return null
  const minutes = Number(match[1] ?? 0)
  const seconds = Number(match[2])
  const fraction = Number((match[3] ?? '').padEnd(3, '0'))
  if (seconds >= 60 && match[1] != null) return null
  return (minutes * 60 + seconds) * 1000 + fraction
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
    const byLine = new Map<number, ChordTimingMark>()
    for (const item of parsed) {
      if (item == null || typeof item !== 'object') continue
      const lineIndex = (item as { lineIndex?: unknown }).lineIndex
      const atMs = (item as { atMs?: unknown }).atMs
      if (typeof lineIndex !== 'number' || !Number.isInteger(lineIndex) || lineIndex < 0) continue
      if (typeof atMs !== 'number' || !Number.isInteger(atMs) || atMs < 0) continue
      const endMs = (item as { endMs?: unknown }).endMs
      if (endMs !== undefined && (!isNonNegativeInteger(endMs) || endMs <= atMs)) continue
      byLine.set(lineIndex, { lineIndex, atMs, ...(endMs !== undefined ? { endMs: endMs as number } : {}) })
    }
    return sortChordTimingMarks(
      [...byLine.values()]
    )
  } catch {
    return []
  }
}

/** Parse legacy line marks and the additive word/instrumental timing entries. */
export function parseChordTimingTimeline(raw: string | null | undefined): ChordTimingTimeline {
  if (raw == null || !raw.trim() || raw.trim() === '[]') return EMPTY_CHORD_TIMELINE
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY_CHORD_TIMELINE
    const lineByIndex = new Map<number, ChordTimingMark>()
    const wordMarks: ChordWordTimingMark[] = []
    const instrumentals: InstrumentalTimingInterval[] = []
    for (const item of parsed) {
      if (item == null || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      if (entry.type === 'instrumental') {
        if (isNonNegativeInteger(entry.startMs) && isNonNegativeInteger(entry.endMs) && entry.endMs > entry.startMs) {
          instrumentals.push({ type: 'instrumental', startMs: entry.startMs, endMs: entry.endMs })
        }
        continue
      }
      if (!isNonNegativeInteger(entry.lineIndex)) continue
      if (isNonNegativeInteger(entry.wordIndex) && isNonNegativeInteger(entry.startMs) && isNonNegativeInteger(entry.endMs) && entry.endMs > entry.startMs) {
        wordMarks.push({ lineIndex: entry.lineIndex, wordIndex: entry.wordIndex, startMs: entry.startMs, endMs: entry.endMs })
        continue
      }
      if (isNonNegativeInteger(entry.atMs) && (entry.endMs === undefined || (isNonNegativeInteger(entry.endMs) && entry.endMs > entry.atMs))) {
        lineByIndex.set(entry.lineIndex, { lineIndex: entry.lineIndex, atMs: entry.atMs, ...(entry.endMs !== undefined ? { endMs: entry.endMs as number } : {}) })
      }
    }
    return {
      lineMarks: sortChordTimingMarks([...lineByIndex.values()]),
      wordMarks: wordMarks.sort((a, b) => a.startMs - b.startMs || a.lineIndex - b.lineIndex || a.wordIndex - b.wordIndex),
      instrumentals: instrumentals.sort((a, b) => a.startMs - b.startMs),
    }
  } catch {
    return EMPTY_CHORD_TIMELINE
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Serialize marks for PATCH. Empty → "[]" (API clears to null). */
export function serializeChordTimingJson(marks: ChordTimingMark[]): string {
  if (marks.length === 0) return '[]'
  return JSON.stringify(sortChordTimingMarks(marks))
}

export function serializeChordTimingTimeline(timeline: ChordTimingTimeline): string {
  const entries: ChordTimingEntry[] = [
    ...timeline.lineMarks,
    ...timeline.wordMarks,
    ...timeline.instrumentals,
  ]
  if (entries.length === 0) return '[]'
  entries.sort((a, b) => timingEntryStart(a) - timingEntryStart(b))
  return JSON.stringify(entries)
}

function timingEntryStart(entry: ChordTimingEntry): number {
  return 'atMs' in entry ? entry.atMs : entry.startMs
}

export function activeChordWord(
  marks: ChordWordTimingMark[],
  currentMs: number,
): { lineIndex: number; wordIndex: number; progress: number } | null {
  if (!Number.isFinite(currentMs) || currentMs < 0) return null
  const active = marks.find((mark) => mark.startMs <= currentMs && currentMs < mark.endMs)
  if (!active) return null
  return {
    lineIndex: active.lineIndex,
    wordIndex: active.wordIndex,
    progress: Math.max(0, Math.min(1, (currentMs - active.startMs) / (active.endMs - active.startMs))),
  }
}

/** All vocal lines currently singing, including overlapping backing vocals. */
export function activeChordLineIndexes(marks: ChordTimingMark[], currentMs: number): number[] {
  if (!Number.isFinite(currentMs) || currentMs < 0) return []
  const active: number[] = []
  let latest: ChordTimingMark | null = null
  for (const mark of marks) {
    if (mark.atMs > currentMs) continue
    if (latest == null || mark.atMs > latest.atMs) latest = mark
    if (mark.endMs !== undefined && currentMs < mark.endMs) active.push(mark.lineIndex)
  }
  if (latest?.endMs === undefined && latest != null) {
    for (const mark of marks) if (mark.endMs === undefined && mark.atMs === latest.atMs) active.push(mark.lineIndex)
  }
  return [...new Set(active)].sort((a, b) => a - b)
}

export function chordWordPresentation(marks: ChordWordTimingMark[], currentMs: number) {
  const active: Array<{ lineIndex: number; wordIndex: number; progress: number }> = []
  if (!Number.isFinite(currentMs) || currentMs < 0) return { active, completed: [] }
  const completed: Array<{ lineIndex: number; wordIndex: number }> = []
  for (const line of wordLineSummaries(marks)) {
    const lineMarks = line.marks
    if (!line.monotonic) {
      let completedWordIndex = -1
      for (const mark of lineMarks) {
        if (mark.startMs <= currentMs && currentMs < mark.endMs) {
          active.push({ lineIndex: mark.lineIndex, wordIndex: mark.wordIndex, progress: (currentMs - mark.startMs) / (mark.endMs - mark.startMs) })
        } else if (mark.endMs <= currentMs) completedWordIndex = Math.max(completedWordIndex, mark.wordIndex)
      }
      if (completedWordIndex >= 0) completed.push({ lineIndex: line.lineIndex, wordIndex: completedWordIndex })
      continue
    }
    let low = 0
    let high = lineMarks.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (lineMarks[middle]!.endMs <= currentMs) low = middle + 1
      else high = middle
    }
    if (low > 0) completed.push({ lineIndex: line.lineIndex, wordIndex: lineMarks[low - 1]!.wordIndex })

    let activeIndex = low
    while (activeIndex < lineMarks.length && lineMarks[activeIndex]!.startMs <= currentMs) {
      const mark = lineMarks[activeIndex++]!
      if (currentMs < mark.endMs) active.push({ lineIndex: mark.lineIndex, wordIndex: mark.wordIndex, progress: (currentMs - mark.startMs) / (mark.endMs - mark.startMs) })
    }
  }
  return { active, completed }
}

type WordLineSummary = { lineIndex: number; firstStartMs: number; lastEndMs: number; nextStartMs?: number; monotonic: boolean; marks: ChordWordTimingMark[] }
const wordLineSummaryCache = new WeakMap<ChordWordTimingMark[], WordLineSummary[]>()

function wordLineSummaries(marks: ChordWordTimingMark[]): WordLineSummary[] {
  const cached = wordLineSummaryCache.get(marks)
  if (cached) return cached
  const byLine = new Map<number, WordLineSummary>()
  for (const mark of marks) {
    const line = byLine.get(mark.lineIndex)
    if (!line) byLine.set(mark.lineIndex, { lineIndex: mark.lineIndex, firstStartMs: mark.startMs, lastEndMs: mark.endMs, monotonic: true, marks: [mark] })
    else {
      line.marks.push(mark)
      line.firstStartMs = Math.min(line.firstStartMs, mark.startMs)
      line.lastEndMs = Math.max(line.lastEndMs, mark.endMs)
    }
  }
  for (const line of byLine.values()) {
    line.marks.sort((left, right) => left.startMs - right.startMs || left.wordIndex - right.wordIndex)
    line.monotonic = line.marks.every((mark, index) => index === 0 || (
      mark.endMs >= line.marks[index - 1]!.endMs && mark.wordIndex > line.marks[index - 1]!.wordIndex
    ))
  }
  const summaries = [...byLine.values()].sort((left, right) => left.firstStartMs - right.firstStartMs || left.lineIndex - right.lineIndex)
  summaries.forEach((line, index) => { line.nextStartMs = summaries[index + 1]?.firstStartMs })
  wordLineSummaryCache.set(marks, summaries)
  return summaries
}

/** Keep a word-timed lyric line active through the gap before the next line starts. */
export function activeChordWordLineIndexes(
  marks: ChordWordTimingMark[],
  currentMs: number,
  timingLineMarks: ChordTimingMark[] = [],
): number[] {
  if (!Number.isFinite(currentMs) || currentMs < 0 || marks.length === 0) return []

  const summaries = wordLineSummaries(marks)
  const lineTimingByIndex = new Map(timingLineMarks.map(mark => [mark.lineIndex, mark]))

  const activeLines: number[] = []
  for (const line of summaries) {
    const lineMark = lineTimingByIndex.get(line.lineIndex)
    if (lineMark?.endMs !== undefined) {
      const lineStartMs = lineMark.atMs
      if (lineStartMs <= currentMs && currentMs < lineMark.endMs) activeLines.push(line.lineIndex)
      continue
    }

    if (currentMs < line.firstStartMs) continue
    if (currentMs < line.lastEndMs) {
      activeLines.push(line.lineIndex)
      continue
    }

    if (line.nextStartMs !== undefined && currentMs < line.nextStartMs) {
      activeLines.push(line.lineIndex)
    }
  }

  return activeLines.sort((left, right) => left - right)
}

export function activeInstrumental(
  intervals: InstrumentalTimingInterval[],
  currentMs: number,
): { progress: number } | null {
  if (!Number.isFinite(currentMs) || currentMs < 0) return null
  const active = intervals.find((interval) => interval.startMs <= currentMs && currentMs < interval.endMs)
  if (!active) return null
  return { progress: Math.max(0, Math.min(1, (currentMs - active.startMs) / (active.endMs - active.startMs))) }
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
  const activeLines = new Set(activeChordLineIndexes(marks, currentMs))
  let active: ChordTimingMark | null = null
  for (const mark of marks) {
    if (activeLines.has(mark.lineIndex) && (active == null || mark.atMs >= active.atMs)) active = mark
  }
  return active?.lineIndex ?? null
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
  const activeSet = new Set(activeChordLineIndexes(marks, currentMs))
  const sorted = sortChordTimingMarks(marks.filter(mark => activeSet.has(mark.lineIndex)))
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

/** Move a word interval without crossing adjacent words on the same lyric line. */
export function nudgeChordWordTiming(
  marks: ChordWordTimingMark[],
  lineIndex: number,
  wordIndex: number,
  deltaMs: number,
): ChordWordTimingMark[] {
  const selected = marks.find((mark) => mark.lineIndex === lineIndex && mark.wordIndex === wordIndex)
  if (!selected || !Number.isFinite(deltaMs)) return marks

  const sameLine = marks
    .filter((mark) => mark.lineIndex === lineIndex && mark.wordIndex !== wordIndex)
    .sort((left, right) => left.startMs - right.startMs || left.wordIndex - right.wordIndex)
  const previous = [...sameLine].reverse().find((mark) => mark.endMs <= selected.startMs)
  const next = sameLine.find((mark) => mark.startMs >= selected.endMs)
  const lowerBound = Math.max(-selected.startMs, previous ? previous.endMs - selected.startMs : Number.NEGATIVE_INFINITY)
  const upperBound = next ? next.startMs - selected.endMs : Number.POSITIVE_INFINITY
  const shift = Math.max(lowerBound, Math.min(upperBound, Math.round(deltaMs)))
  if (shift === 0) return marks

  return marks.map((mark) => mark === selected
    ? { ...mark, startMs: mark.startMs + shift, endMs: mark.endMs + shift }
    : mark)
}
