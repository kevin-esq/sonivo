import type { ResourceSummary } from '../api/client'
import { isPlayableAudioResource } from './pickPracticeAudio'

/** ADR-0032 Q-W32-5: file-kind, playable audio MIME, purpose audio/practice/click. Links OUT. */
export function isDigitizableResource(resource: ResourceSummary): boolean {
  if (resource.kind !== 'file') return false
  if (resource.purpose !== 'audio' && resource.purpose !== 'practice' && resource.purpose !== 'click') {
    return false
  }
  return isPlayableAudioResource(resource)
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
