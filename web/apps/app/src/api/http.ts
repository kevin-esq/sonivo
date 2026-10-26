import {
  ApiError,
  apiRequest,
  apiUpload,
  clearCsrfToken,
  ensureCsrfToken,
} from '@sonivo/api-client/client'
import type { I18nKey } from '../i18n'

export { ApiError, apiRequest, apiUpload, clearCsrfToken, ensureCsrfToken }

/** Map normalized API failures to localized product copy. */
export function problemDetail(error: unknown, t: (key: I18nKey) => string): string {
  if (!(error instanceof ApiError)) return t('common.errorGeneral')

  if (error.status === 400 || error.status === 422) return t('common.errorInvalidRequest')
  if (error.status === 401) return t('common.errorAuthentication')
  if (error.status === 403) return t('common.errorForbidden')
  if (error.status === 404) return t('common.errorNotFound')
  if (error.status === 409) return t('common.errorConflict')
  if (error.status === 413) return t('common.errorFileTooLarge')
  if (error.status === 429) return t('common.errorRateLimited')
  if (error.status >= 500) return t('common.errorUnavailable')
  return t('common.errorGeneral')
}

/**
 * True when the API refused a login because the mailbox is not verified yet
 * (ADR-0038). The marker is reachable only after a correct password, so it
 * cannot be used to discover registered addresses.
 */
export function isUnverifiedEmailError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  const body = error.body as { reason?: string } | undefined
  return body?.reason === 'email_unverified'
}

export function isConflictError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}
