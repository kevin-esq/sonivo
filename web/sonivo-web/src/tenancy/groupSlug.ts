const LAST_GROUP_KEY = 'sonivo:lastGroup'

/** Remembers the last group opened (best effort). */
export function rememberLastGroup(id: string): void {
  try {
    window.localStorage.setItem(LAST_GROUP_KEY, id)
  } catch {
    // almacenamiento no disponible
  }
}

export function readLastGroup(): string | null {
  try {
    return window.localStorage.getItem(LAST_GROUP_KEY)
  } catch {
    return null
  }
}
