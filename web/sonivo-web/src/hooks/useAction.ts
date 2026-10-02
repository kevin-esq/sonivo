import { useCallback, useEffect, useRef, useState } from 'react'

/** Outcome of a single `run` call: success carries the value, failure the thrown error. */
export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: unknown }

/** Re-entrant calls resolve to this marker so callers can tell "busy" from a real failure. */
const ALREADY_PENDING = new Error('Action already in progress')

export type UseAction<Args extends unknown[], T> = {
  /** Invoke the action; resolves instead of throwing so forms never lose the error. */
  run: (...args: Args) => Promise<ActionResult<T>>
  /** True while the action is in flight; while true, further `run` calls are ignored. */
  pending: boolean
  /** The last error thrown by the action, or null. */
  error: unknown
  /** Clear the stored error (e.g. when the user edits a field). */
  reset: () => void
}

/**
 * Wrap an async action with pending/error state. The latest action closure is
 * read through a ref, so `run` keeps a stable identity and always sees fresh state.
 */
export function useAction<Args extends unknown[], T>(
  action: (...args: Args) => Promise<T>,
): UseAction<Args, T> {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const busyRef = useRef(false)
  const actionRef = useRef(action)

  useEffect(() => {
    actionRef.current = action
  }, [action])

  const reset = useCallback(() => setError(null), [])

  const run = useCallback(async (...args: Args): Promise<ActionResult<T>> => {
    if (busyRef.current) return { ok: false, error: ALREADY_PENDING }
    busyRef.current = true
    setPending(true)
    setError(null)
    try {
      const value = await actionRef.current(...args)
      return { ok: true, value }
    } catch (err) {
      setError(err)
      return { ok: false, error: err }
    } finally {
      busyRef.current = false
      setPending(false)
    }
  }, [])

  return { run, pending, error, reset }
}
