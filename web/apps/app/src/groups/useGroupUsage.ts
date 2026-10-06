import { useCallback, useEffect, useState } from 'react'
import { getGroupUsage, type GroupUsage } from '../api/client'

/**
 * Group plan usage vs limits (ADR-0071 §4.1). The server stays authoritative for
 * enforcement; this only drives the 80% / 100% notices and the create-button lock
 * (validation symmetry: the client mirrors the same limits).
 */
export function useGroupUsage(groupId: string | undefined) {
  const [usage, setUsage] = useState<GroupUsage | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!groupId) return
    setLoading(true)
    try {
      setUsage(await getGroupUsage(groupId))
    } catch {
      // Usage is advisory; a failure must never block the page.
      setUsage(null)
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { usage, loading, reload }
}
