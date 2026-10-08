import { apiRequest } from './http'

/** Anonymous feature flags exposed by the API. */
export type FeatureFlags = {
  lrc: boolean
  stageMode: boolean
  groupBranding: boolean
  notifications: boolean
}

export async function fetchFeatures(): Promise<FeatureFlags> {
  return apiRequest<FeatureFlags>('/api/features')
}
