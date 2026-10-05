/** Q9 conductor “Seguir al director” preference (ADR-0036 / Q9-Q4). Per event. */

const PREFIX = 'sonivo.conductor.follow'

function storageKey(eventId: string): string {
  return `${PREFIX}:${eventId}`
}

export function readConductorFollow(eventId: string): boolean {
  try {
    return localStorage.getItem(storageKey(eventId)) === '1'
  } catch {
    return false
  }
}

export function writeConductorFollow(eventId: string, enabled: boolean): void {
  try {
    localStorage.setItem(storageKey(eventId), enabled ? '1' : '0')
  } catch {
    // Quota / private mode — ignore
  }
}
