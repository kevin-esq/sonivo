/** Practice ChordPro view mode prefs (ADR-0030 P0). Per group + arrangement. */

export type PracticeViewMode = 'singer' | 'guitarist'

const PREFIX = 'sonivo.practice.viewMode'

function storageKey(groupId: string, arrangementId: string): string {
  return `${PREFIX}:${groupId}:${arrangementId}`
}

export function readPracticeViewMode(
  groupId: string,
  arrangementId: string,
): PracticeViewMode {
  try {
    const raw = localStorage.getItem(storageKey(groupId, arrangementId))
    if (raw === 'singer' || raw === 'guitarist') return raw
  } catch {
    // Quota / private mode
  }
  return 'guitarist'
}

export function writePracticeViewMode(
  groupId: string,
  arrangementId: string,
  mode: PracticeViewMode,
): void {
  try {
    localStorage.setItem(storageKey(groupId, arrangementId), mode)
  } catch {
    // Quota / private mode — ignore
  }
}
