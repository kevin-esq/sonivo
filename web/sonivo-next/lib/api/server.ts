import { cookies } from 'next/headers'

/**
 * Server-side fetch that forwards the incoming cookie header to the .NET API
 * for authenticated SSR. Never cache authenticated responses.
 */
export async function serverApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:5171'
  const cookieHeader = (await cookies()).toString()

  return fetch(`${apiOrigin}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })
}
