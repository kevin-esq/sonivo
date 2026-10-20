import type { I18nKey } from '../i18n'

export class ApiError extends Error {
  readonly status: number
  readonly body?: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

let csrfToken: string | null = null

export async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken
  }

  const response = await fetch('/api/auth/csrf', {
    credentials: 'include',
  })
  if (!response.ok) {
    throw new ApiError('Failed to obtain CSRF token', response.status)
  }

  const data = (await response.json()) as { token: string }
  csrfToken = data.token
  return csrfToken
}

export function clearCsrfToken(): void {
  csrfToken = null
}

type RequestOptions = {
  method?: string
  body?: unknown
  requireCsrf?: boolean
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
  if (unsafe || options.requireCsrf) {
    headers['X-CSRF-TOKEN'] = await ensureCsrfToken()
  }

  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    throw new ApiError(`Request failed: ${response.status}`, response.status, body)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

/** Multipart upload (branding logo/banner): the browser sets the boundary, so no Content-Type. */
export async function apiUpload<T>(path: string, file: File, field = 'file'): Promise<T> {
  const form = new FormData()
  form.append(field, file)
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-TOKEN': await ensureCsrfToken() },
    body: form,
  })

  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    throw new ApiError(`Request failed: ${response.status}`, response.status, body)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

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
 * (ADR-0038). The marker only exists on the branch where the password was
 * already correct, so it is unreachable without a valid credential and cannot
 * be used to discover which addresses are registered. Every other failure
 * (unknown email, wrong password, lockout) carries no marker.
 *
 * `Results.Problem(extensions: …)` flattens the extension entries into the TOP
 * LEVEL of the problem body, so `reason` sits next to `detail`, not nested.
 */
export function isUnverifiedEmailError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  const body = error.body as { reason?: string } | undefined
  return body?.reason === 'email_unverified'
}

export function isConflictError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}
