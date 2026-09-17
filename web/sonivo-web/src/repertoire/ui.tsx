import { useEffect, useState } from 'react'
import { ApiError, getGroup, problemDetail, type GroupDetail } from '../api/client'

export { ConflictAlert, ProblemAlert } from '../ui/alert'
export { ConfirmDialog } from '../ui/dialog'
export { fieldClass } from '../ui/field'
export {
  dangerButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../ui/button'

export const CONFLICT_MESSAGE =
  'Someone else changed this item. Reload to get the latest version.'

export function isOwnerRole(role: string | undefined): boolean {
  return role === 'Owner'
}

export function formatOriginKind(kind: string): string {
  switch (kind) {
    case 'original':
      return 'Original'
    case 'cover':
      return 'Cover'
    case 'other':
      return 'Other'
    default:
      return kind
  }
}

export function formatPurpose(purpose: string): string {
  return purpose.charAt(0).toUpperCase() + purpose.slice(1)
}

export function authzErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  if (error.status === 403) {
    return 'You do not have permission to change this item.'
  }
  if (error.status === 401) {
    return 'Your session has expired. Please log in again.'
  }
  return null
}

export function mutationErrorMessage(error: unknown): string {
  return authzErrorMessage(error) ?? problemDetail(error)
}

export function useGroupContext(groupId: string | undefined, userId: string) {
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    if (!groupId) return
    setError(null)
    try {
      setGroup(await getGroup(groupId))
    } catch (err) {
      setGroup(null)
      if (err instanceof ApiError && err.status === 404) {
        setError('Group not found or you do not have access.')
      } else {
        setError(problemDetail(err))
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!groupId) return
      setGroup(undefined)
      setError(null)
      try {
        const result = await getGroup(groupId)
        if (!cancelled) setGroup(result)
      } catch (err) {
        if (cancelled) return
        setGroup(null)
        if (err instanceof ApiError && err.status === 404) {
          setError('Group not found or you do not have access.')
        } else {
          setError(problemDetail(err))
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, userId])

  return { group, error, reload }
}
