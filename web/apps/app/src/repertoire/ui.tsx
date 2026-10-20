import { useEffect, useState } from 'react'
import { ApiError, getGroup, problemDetail, type GroupDetail } from '../api/client'
import { useT, type I18nKey } from '../i18n'

export { ConflictAlert, ProblemAlert } from '../ui/alert'
export { ConfirmDialog } from '../ui/dialog'
export { fieldClass } from '../ui/field'
export {
  dangerButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../ui/button'

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

/** API role → localized label for musicians (values stay Owner|Manager|Member|Viewer on the wire). */
export function formatMembershipRole(
  role: string | undefined,
  t: (key: I18nKey) => string,
): string {
  switch (role) {
    case 'Owner':
      return t('roles.roleOwner')
    case 'Manager':
      return t('roles.roleManager')
    case 'Member':
      return t('roles.roleMember')
    case 'Viewer':
      return t('roles.roleViewer')
    default:
      return role ?? ''
  }
}

export function formatOriginKind(
  kind: string,
  t: (key: I18nKey) => string,
): string {
  switch (kind) {
    case 'original':
      return t('songs.originOriginal')
    case 'cover':
      return t('songs.originCover')
    case 'other':
      return t('songs.originOther')
    default:
      return kind
  }
}

export function formatPurpose(
  purpose: string,
  t: (key: I18nKey) => string,
): string {
  switch (purpose) {
    case 'chart':
      return t('resources.purposeChart')
    case 'lyrics':
      return t('resources.purposeLyrics')
    case 'audio':
      return t('resources.purposeAudio')
    case 'click':
      return t('resources.purposeClick')
    case 'practice':
      return t('resources.purposePractice')
    case 'reference':
      return t('resources.purposeReference')
    case 'other':
      return t('resources.purposeOther')
    default:
      return purpose.charAt(0).toUpperCase() + purpose.slice(1)
  }
}

export function authzErrorMessage(error: unknown, t: (key: I18nKey) => string): string | null {
  if (!(error instanceof ApiError)) return null
  if (error.status === 403) {
    return t('common.errorForbidden')
  }
  if (error.status === 401) {
    return t('common.errorAuthentication')
  }
  return null
}

export function mutationErrorMessage(error: unknown, t: (key: I18nKey) => string): string {
  return authzErrorMessage(error, t) ?? problemDetail(error, t)
}

export function useGroupContext(groupId: string | undefined, userId: string) {
  const { t } = useT()
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
        setError(t('common.groupNotFoundOrNoAccess'))
      } else {
        setError(problemDetail(err, t))
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
          setError(t('common.groupNotFoundOrNoAccess'))
        } else {
          setError(problemDetail(err, t))
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
