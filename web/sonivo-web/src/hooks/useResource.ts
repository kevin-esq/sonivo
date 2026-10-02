import { useCallback, useEffect, useRef, useState } from 'react'
import type { DependencyList } from 'react'

export type Resource<T> = {
  data: T | undefined
  error: unknown
  loading: boolean
  reload: () => void
}

/**
 * Fetch a resource and keep it in sync with `deps`. Mirrors the `cancelled`
 * pattern used across the app: a late response after unmount or after deps
 * change is dropped. Pass `null` as the fetcher to stay idle (e.g. while a
 * required route param or parent resource is not ready yet).
 */
export function useResource<T>(
  fetcher: (() => Promise<T>) | null,
  deps: DependencyList,
): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const fetcherRef = useRef(fetcher)

  useEffect(() => {
    fetcherRef.current = fetcher
  }, [fetcher])

  useEffect(() => {
    const run = fetcherRef.current
    if (!run) return
    let cancelled = false
    setData(undefined)
    setError(null)
    setLoading(true)
    run()
      .then((value) => {
        if (!cancelled) setData(value)
      })
      .catch((err) => {
        if (!cancelled) setError(err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // `deps` (plus the reload counter) drive refetches; the fetcher is read from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey])

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  return { data, error, loading, reload }
}
