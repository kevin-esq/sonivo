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

export type CurrentUser = {
  id: string
  email: string | null
  displayName: string | null
  emailConfirmed: boolean
}

export type GroupSummary = {
  id: string
  name: string
  role: string
  version: number
  createdAt: string
}

export type GroupDetail = GroupSummary & {
  updatedAt: string
}

export async function fetchHealth(): Promise<{ status: string }> {
  return apiRequest('/api/health')
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await apiRequest<CurrentUser>('/api/auth/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }
    throw error
  }
}

export async function registerUser(input: {
  email: string
  password: string
  displayName?: string
}): Promise<CurrentUser> {
  clearCsrfToken()
  await ensureCsrfToken()
  return apiRequest<CurrentUser>('/api/auth/register', {
    method: 'POST',
    body: input,
  })
}

export async function loginUser(input: {
  email: string
  password: string
  rememberMe?: boolean
}): Promise<CurrentUser> {
  clearCsrfToken()
  await ensureCsrfToken()
  const user = await apiRequest<CurrentUser>('/api/auth/login', {
    method: 'POST',
    body: input,
  })
  clearCsrfToken()
  await ensureCsrfToken()
  return user
}

export async function logoutUser(): Promise<void> {
  await apiRequest<void>('/api/auth/logout', { method: 'POST' })
  clearCsrfToken()
}

export async function listMyGroups(): Promise<GroupSummary[]> {
  return apiRequest<GroupSummary[]>('/api/groups')
}

export async function createGroup(name: string): Promise<GroupDetail> {
  return apiRequest<GroupDetail>('/api/groups', {
    method: 'POST',
    body: { name },
  })
}

export async function getGroup(groupId: string): Promise<GroupDetail> {
  return apiRequest<GroupDetail>(`/api/groups/${groupId}`)
}

export function problemDetail(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { detail?: string; title?: string } | undefined
    return body?.detail ?? body?.title ?? error.message
  }
  return 'Unexpected error'
}
