import { apiRequest } from './http'

/** ADR-0055 W-E: best-effort presence heartbeat (throttled server-side). */
export async function presenceHeartbeat(): Promise<void> {
  await apiRequest('/api/presence/heartbeat', { method: 'POST' })
}
