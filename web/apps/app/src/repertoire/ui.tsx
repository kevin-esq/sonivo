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

export const ACCESS_DENIED_MESSAGE =
  'No encontramos este grupo o no tienes acceso.'

export function isOwnerRole(role: string | undefined): boolean {
  return role === 'Owner'
}

/** ADR-0051: Owner or Manager may manage repertoire, setlists and events. */
export function canManageContentRole(role: string | undefined): boolean {
  return role === 'Owner' || role === 'Manager'
}

/** ADR-0051: Owner, Manager or Member may RSVP and take part in practice. */
export function canParticipateRole(role: string | undefined): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Member'
}

/** API role → Spanish label for musicians (values stay Owner|Manager|Member|Viewer on the wire). */
export function formatMembershipRole(role: string | undefined): string {
  switch (role) {
    case 'Owner':
      return 'Organizador'
    case 'Manager':
      return 'Encargado'
    case 'Member':
      return 'Miembro'
    case 'Viewer':
      return 'Lector'
    default:
      return role ?? ''
  }
}

export function formatOriginKind(kind: string): string {
  switch (kind) {
    case 'original':
      return 'Propia'
    case 'cover':
      return 'Versión'
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
      return 'Metrónomo'
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
        setError(ACCESS_DENIED_MESSAGE)
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
          setError(ACCESS_DENIED_MESSAGE)
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
