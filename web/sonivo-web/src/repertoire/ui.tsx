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
  'Otra persona cambió este elemento. Recarga para ver la versión más reciente.'

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
      return 'Otro'
    default:
      return kind
  }
}

export function formatPurpose(purpose: string): string {
  switch (purpose) {
    case 'chart':
      return 'Partitura'
    case 'lyrics':
      return 'Letra'
    case 'audio':
      return 'Audio'
    case 'click':
      return 'Click'
    case 'practice':
      return 'Ensayo'
    case 'reference':
      return 'Referencia'
    case 'other':
      return 'Otro'
    default:
      return purpose.charAt(0).toUpperCase() + purpose.slice(1)
  }
}

export function formatArrangementCount(count: number): string {
  return count === 1 ? '1 arreglo' : `${count} arreglos`
}

export function authzErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  if (error.status === 403) {
    return 'No tienes permiso para cambiar este elemento.'
  }
  if (error.status === 401) {
    return 'Tu sesión expiró. Inicia sesión de nuevo.'
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
