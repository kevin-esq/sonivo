import { useCallback, useState } from 'react'

/**
 * State mirrored into `localStorage` as JSON, best-effort (private mode and
 * quota failures fall back to in-memory state). Pass a namespaced key such as
 * `sonivo:groups:view` so entries stay greppable and easy to clear.
 */
export function usePersisted<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  const set = useCallback(
    (next: T) => {
      setValue(next)
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // best-effort: the value still lives in memory for this session
      }
    },
    [key],
  )

  return [value, set]
}
