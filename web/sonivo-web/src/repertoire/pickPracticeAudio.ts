import { resourceContentUrl, type ResourceSummary } from '../api/client'

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac', '.webm', '.opus']

export type PracticeAudioSource = {
  resourceId: string
  src: string
  label: string
  purpose: 'audio' | 'click'
}

function probeName(resource: ResourceSummary): string {
  const raw = resource.originalFileName ?? resource.url ?? ''
  return raw.split('?')[0]?.toLowerCase() ?? ''
}

/** True when MIME or filename/URL extension looks like HTML5-playable audio. */
export function isPlayableAudioResource(resource: ResourceSummary): boolean {
  const contentType = resource.contentType?.toLowerCase() ?? ''
  if (contentType.startsWith('audio/')) return true
  const name = probeName(resource)
  return AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext))
}

function toSource(
  resource: ResourceSummary,
  purpose: 'audio' | 'click',
  groupId: string,
  arrangementId: string,
): PracticeAudioSource | null {
  if (!isPlayableAudioResource(resource)) return null

  if (resource.kind === 'file') {
    return {
      resourceId: resource.id,
      src: resourceContentUrl(groupId, arrangementId, resource.id),
      label: resource.label,
      purpose,
    }
  }

  if (resource.url) {
    return {
      resourceId: resource.id,
      src: resource.url,
      label: resource.label,
      purpose,
    }
  }

  return null
}

/**
 * All playable Resources with purpose `audio` then `click`.
 * File → content URL; link → URL. Skips non-audio MIME / unknown extensions.
 */
export function listPracticeAudioTracks(
  resources: ResourceSummary[],
  groupId: string,
  arrangementId: string,
): PracticeAudioSource[] {
  const ordered: { resource: ResourceSummary; purpose: 'audio' | 'click' }[] = [
    ...resources.filter((r) => r.purpose === 'audio').map((r) => ({ resource: r, purpose: 'audio' as const })),
    ...resources.filter((r) => r.purpose === 'click').map((r) => ({ resource: r, purpose: 'click' as const })),
  ]

  const tracks: PracticeAudioSource[] = []
  for (const { resource, purpose } of ordered) {
    const source = toSource(resource, purpose, groupId, arrangementId)
    if (source) tracks.push(source)
  }
  return tracks
}

/**
 * Prefer purpose `audio`, then `click`. File → content URL; link → URL.
 * Skips resources that are not audio MIME / known audio extension.
 */
export function pickPracticeAudio(
  resources: ResourceSummary[],
  groupId: string,
  arrangementId: string,
): PracticeAudioSource | null {
  return listPracticeAudioTracks(resources, groupId, arrangementId)[0] ?? null
}
