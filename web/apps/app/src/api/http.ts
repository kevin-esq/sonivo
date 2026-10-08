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

export function problemDetail(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as
      | { detail?: string; title?: string; errors?: Record<string, string[] | string> }
      | undefined
    if (body?.errors && typeof body.errors === 'object') {
      const parts = Object.entries(body.errors).flatMap(([key, value]) => {
        if (Array.isArray(value)) {
          return value.map((item) => `${key}: ${item}`)
        }
        return [`${key}: ${value}`]
      })
      if (parts.length > 0) {
        return parts.join(' ')
      }
    }
    return body?.detail ?? body?.title ?? error.message
  }
  return 'Unexpected error'
}

export function isConflictError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}
