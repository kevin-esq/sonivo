/** Practice “Seguir letra” preference (ADR-0031 / Q-SYNC-5). Per group + arrangement. */

const PREFIX = 'sonivo.practice.followAlong'

function storageKey(groupId: string, arrangementId: string): string {
  return `${PREFIX}:${groupId}:${arrangementId}`
}

export function readPracticeFollowAlong(
  groupId: string,
  arrangementId: string,
): boolean {
  try {
    return localStorage.getItem(storageKey(groupId, arrangementId)) === '1'
  } catch {
    return false
  }
}

export function writePracticeFollowAlong(
  groupId: string,
  arrangementId: string,
  enabled: boolean,
): void {
  try {
    localStorage.setItem(storageKey(groupId, arrangementId), enabled ? '1' : '0')
  } catch {
    // Quota / private mode — ignore
  }
}
