import { useCallback, useEffect, useState } from 'react'
import {
  getGroupNotificationPreferences,
  problemDetail,
  updateGroupNotificationPreferences,
  type GroupNotificationPreferences,
} from '../../api/client'
import { useT } from '../../i18n'

export function useGroupNotificationPreferences(groupId: string | undefined, enabled: boolean) {
  const { t } = useT()
  const [preferences, setPreferences] = useState<GroupNotificationPreferences | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const updatePreferences = useCallback((next: GroupNotificationPreferences) => {
    setPreferences(next)
    setSaved(false)
  }, [])

  useEffect(() => {
    if (!groupId || !enabled) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getGroupNotificationPreferences(groupId)
      .then((result) => {
        if (!cancelled) setPreferences(result)
      })
      .catch((requestError) => {
        if (!cancelled) setError(problemDetail(requestError, t))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [groupId, enabled, t])

  const save = useCallback(async () => {
    if (!groupId || !preferences) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await updateGroupNotificationPreferences(groupId, preferences)
      setSaved(true)
    } catch (requestError) {
      setError(problemDetail(requestError, t))
    } finally {
      setSaving(false)
    }
  }, [groupId, preferences, t])

  return { preferences, setPreferences: updatePreferences, loading, saving, error, saved, save }
}
