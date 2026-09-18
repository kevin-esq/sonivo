const PREFIX = 'sonivo.practice.player'

export type PracticePlayerPrefs = {
  volume: number
  resourceId: string | null
}

function storageKey(groupId: string, arrangementId: string): string {
  return `${PREFIX}:${groupId}:${arrangementId}`
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(0, value))
}

export function readPracticePlayerPrefs(
  groupId: string,
  arrangementId: string,
): PracticePlayerPrefs {
  try {
    const raw = localStorage.getItem(storageKey(groupId, arrangementId))
    if (!raw) return { volume: 1, resourceId: null }
    const parsed = JSON.parse(raw) as Partial<PracticePlayerPrefs>
    return {
      volume: clampVolume(typeof parsed.volume === 'number' ? parsed.volume : 1),
      resourceId: typeof parsed.resourceId === 'string' ? parsed.resourceId : null,
    }
  } catch {
    return { volume: 1, resourceId: null }
  }
}

export function writePracticePlayerPrefs(
  groupId: string,
  arrangementId: string,
  prefs: PracticePlayerPrefs,
): void {
  try {
    localStorage.setItem(
      storageKey(groupId, arrangementId),
      JSON.stringify({
        volume: clampVolume(prefs.volume),
        resourceId: prefs.resourceId,
      }),
    )
  } catch {
    // Quota / private mode — ignore
  }
}
