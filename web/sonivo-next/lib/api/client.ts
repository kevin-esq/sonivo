import type { EventRsvpItem, EventRsvpResponse, EventRsvpUpsertResult } from './types'

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

/**
 * Same-origin CSRF flow used by the shipped SPA: fetch the request token, then
 * send it as `X-CSRF-TOKEN`. The token cookie stays HttpOnly. No CSRF exemption
 * is required by the .NET API (ADR-0067).
 */
export async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken

  const response = await fetch('/api/auth/csrf', { credentials: 'include' })
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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }

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

export async function loginUser(input: {
  email: string
  password: string
  rememberMe?: boolean
}): Promise<unknown> {
  clearCsrfToken()
  await ensureCsrfToken()
  const result = await apiRequest('/api/auth/login', { method: 'POST', body: input })
  clearCsrfToken()
  await ensureCsrfToken()
  return result
}

/** Redeem a single-use handoff code; the .NET API sets the host-only cookie. */
export async function redeemHandoff(code: string): Promise<{ redirect: string }> {
  return apiRequest<{ redirect: string }>('/api/session/handoff/redeem', {
    method: 'POST',
    body: { code },
  })
}

export async function listEventRsvps(groupId: string, eventId: string): Promise<EventRsvpItem[]> {
  const payload = await apiRequest<{ items: EventRsvpItem[] }>(
    `/api/groups/${groupId}/events/${eventId}/rsvps`,
  )
  return payload.items
}

export async function upsertEventRsvp(
  groupId: string,
  eventId: string,
  response: EventRsvpResponse,
): Promise<EventRsvpUpsertResult> {
  return apiRequest<EventRsvpUpsertResult>(
    `/api/groups/${groupId}/events/${eventId}/rsvp`,
    { method: 'PUT', body: { response } },
  )
}
