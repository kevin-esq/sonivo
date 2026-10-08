import { apiRequest, apiUpload } from './http'

export type GroupSummary = {
  id: string
  name: string
  slug?: string | null
  role: string
  version: number
  createdAt: string
  memberCount?: number
  nextEventAt?: string | null
  lastActivityAt?: string | null
}

/** Plan-gated branding capabilities returned with the group (camelCase). */
export type BrandingCapabilities = {
  themes: boolean
  accent: boolean
  intensity: boolean
  icon: boolean
  splitColors: boolean
  gradientStyle: boolean
  font: boolean
  brandName: boolean
  welcomeText: boolean
  loginBranding: boolean
  logo: boolean
  banner: boolean
  removePoweredBy: boolean
}

export type GroupDetail = GroupSummary & {
  updatedAt: string
  planId: string
  capabilities: BrandingCapabilities
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

/** Plan catalog exposed by the API (`GET /api/plans`). */
export type PlanCatalogEntry = {
  id: string
  priceMonthlyMxn: number
  trialDays: number
  trialRequiresCard: boolean
  limits: Record<string, unknown>
  features: Record<string, unknown>
  capabilities: BrandingCapabilities
}

export type PlanCatalog = {
  defaultPlanId: string
  plans: PlanCatalogEntry[]
}

export async function getPlanCatalog(): Promise<PlanCatalog> {
  return apiRequest<PlanCatalog>('/api/plans')
}

/** Usage metric: how much is used and the plan limit (null = unlimited). */
export type UsageMetric = { used: number; limit: number | null }

export type GroupUsage = {
  planId: string
  members: UsageMetric
  songs: UsageMetric
  setlists: UsageMetric
  eventsThisMonth: UsageMetric
  storageBytes: UsageMetric
}

export async function getGroupUsage(groupId: string): Promise<GroupUsage> {
  return apiRequest<GroupUsage>(`/api/groups/${groupId}/usage`)
}

export type GroupBySlug = GroupDetail & { moved?: boolean }

/** Resolves a path slug to its group (current or historical, with `moved`). */
export async function getGroupBySlug(slug: string): Promise<GroupBySlug> {
  return apiRequest<GroupBySlug>(`/api/groups/by-slug/${encodeURIComponent(slug)}`)
}

export type GroupBranding = {
  groupId: string
  displayName: string | null
  accentHex: string | null
  secondaryHex: string | null
  accentColorHex: string | null
  successHex: string | null
  warningHex: string | null
  errorHex: string | null
  typography: string | null
  onPrimary: string | null
  onSecondary: string | null
  onAccent: string | null
  themeId: string | null
  intensity: string | null
  gradientStyle: string | null
  coverKind: string | null
  coverValue: string | null
  themeDefault: string | null
  defaultLocale: string | null
  welcomeText: string | null
  loginHeadline: string | null
  tagline: string | null
  verse: string | null
  hasLogo: boolean
  logoUrl: string | null
  hasBanner: boolean
  bannerUrl: string | null
  hasFavicon: boolean
  faviconUrl: string | null
  showSonivoCredit: boolean
  version: number
}

export type PublicBranding = {
  name: string | null
  logoUrl: string | null
  accentHex: string | null
  loginHeadline: string | null
  secondaryHex: string | null
  bannerUrl: string | null
}

export async function getGroupBranding(groupId: string): Promise<GroupBranding> {
  return apiRequest<GroupBranding>(`/api/groups/${groupId}/branding`)
}

export async function updateGroupBranding(
  groupId: string,
  input: {
    expectedVersion: number
    displayName?: string | null
    accentHex?: string | null
    secondaryHex?: string | null
    accentColorHex?: string | null
    successHex?: string | null
    warningHex?: string | null
    errorHex?: string | null
    typography?: string | null
    coverKind?: string | null
    coverValue?: string | null
    themeDefault?: string | null
    defaultLocale?: string | null
    welcomeText?: string | null
    loginHeadline?: string | null
    tagline?: string | null
    verse?: string | null
    showSonivoCredit?: boolean
    themeId?: string | null
    intensity?: string | null
    gradientStyle?: string | null
  },
): Promise<GroupBranding> {
  return apiRequest<GroupBranding>(`/api/groups/${groupId}/branding`, {
    method: 'PUT',
    body: input,
  })
}

/** Uploads the group logo or the header banner (multipart; ADR-0054). */
export async function uploadGroupBrandingImage(
  groupId: string,
  kind: 'logo' | 'banner',
  file: File,
): Promise<GroupBranding> {
  return apiUpload<GroupBranding>(`/api/groups/${groupId}/branding/${kind}`, file)
}

/** Uploads the group favicon/app icon (multipart). */
export async function uploadGroupBrandingFavicon(
  groupId: string,
  file: File,
): Promise<GroupBranding> {
  return apiUpload<GroupBranding>(`/api/groups/${groupId}/branding/favicon`, file)
}

/** Anonymous, uniform branding read for the branded access screen. */
export async function getPublicBranding(slug: string): Promise<PublicBranding> {
  return apiRequest<PublicBranding>(`/api/groups/by-slug/${encodeURIComponent(slug)}/branding`)
}

export async function updateGroup(
  groupId: string,
  input: { name: string; expectedVersion: number },
): Promise<GroupDetail> {
  return apiRequest<GroupDetail>(`/api/groups/${groupId}`, {
    method: 'PATCH',
    body: input,
  })
}

export async function deleteGroup(groupId: string, expectedVersion: number): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}`, {
    method: 'DELETE',
    body: { expectedVersion },
  })
}
