import { apiRequest } from './http'

/** Redeems a single-use handoff code; the API sets the host-only session cookie (ADR-0067). */
export async function redeemHandoff(code: string): Promise<{ redirect: string }> {
  return apiRequest<{ redirect: string }>('/api/session/handoff/redeem', {
    method: 'POST',
    body: { code },
  })
}

/**
 * Issues a single-use handoff code. With a slug it targets the tenant host
 * (`{slug}.sonivo.lat`); without one it targets the product host
 * (`app.sonivo.lat`). Requires an authenticated session (ADR-0067).
 */
export async function startHandoff(slug?: string): Promise<{ redirect: string }> {
  return apiRequest<{ redirect: string }>('/api/session/handoff/start', {
    method: 'POST',
    body: slug ? { slug } : {},
  })
}
