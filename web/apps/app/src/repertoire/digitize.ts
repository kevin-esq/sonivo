import type { ResourceSummary } from '../api/client'
import { isPlayableAudioResource } from './pickPracticeAudio'

/** ADR-0032 Q-W32-5: file-kind, WAV audio, purpose audio/practice/click. Links OUT. */
export function isDigitizableResource(resource: ResourceSummary): boolean {
  if (resource.kind !== 'file') return false
  if (resource.purpose !== 'audio' && resource.purpose !== 'practice' && resource.purpose !== 'click') {
    return false
  }
  if (!isPlayableAudioResource(resource)) return false
  // Thin decoder is WAV-only (mirrors server DigitizeEligibility.IsWavAudio).
  const mime = resource.contentType?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (mime === 'audio/wav' || mime === 'audio/x-wav' || mime === 'audio/wave' || mime === 'audio/vnd.wave') {
    return true
  }
  const name = (resource.originalFileName ?? '').split('?')[0]?.toLowerCase() ?? ''
  return name.endsWith('.wav')
}

/** Milliseconds → "m:ss" for the draft review list. */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Plain-text lyric draft: one segment per line. */
export function segmentsToLyricsDraft(segments: { text: string }[]): string {
  return segments
    .map((s) => s.text.trim())
    .filter((t) => t.length > 0)
    .join('\n')
}

/**
 * ADR-0034 Q-W34-1: review-gated timing-mark suggest (client-only, deterministic).
 * Maps each transcript segment onto a lyric-bearing ChordPro line index:
 * lyric-bearing = trimmed non-blank lines NOT matching /^\{.*\}$/.
 * Segment i → i-th lyric line; overflow clamps to the last lyric line.
 * No lyric lines (or null/blank body) → identity clamped to max(lineCount - 1, 0).
 */
export function suggestLineMapping(
  chordProText: string | null | undefined,
  segmentCount: number,
): number[] {
  if (!Number.isInteger(segmentCount) || segmentCount <= 0) return []
  const lines = (chordProText ?? '').replace(/\r\n/g, '\n').split('\n')
  const lyricIndices: number[] = []
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed.length === 0) return
    if (/^\{.*\}$/.test(trimmed)) return
    lyricIndices.push(index)
  })
  if (lyricIndices.length === 0) {
    const maxLine = Math.max(lines.length - 1, 0)
    return Array.from({ length: segmentCount }, (_, i) => Math.min(i, maxLine))
  }
  const lastLyric = lyricIndices[lyricIndices.length - 1]
  return Array.from({ length: segmentCount }, (_, i) =>
    i < lyricIndices.length ? lyricIndices[i] : lastLyric,
  )
}
