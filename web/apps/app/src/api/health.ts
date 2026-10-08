import { apiRequest } from './http'

export async function fetchHealth(): Promise<{ status: string }> {
  return apiRequest('/api/health')
}
