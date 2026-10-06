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

export type CurrentUser = {
  id: string
  email: string | null
  displayName: string | null
  emailConfirmed: boolean
  mustChangePassword?: boolean
  managedByGroupId?: string | null
}

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

export async function changePassword(input: {
  currentPassword: string
  newPassword: string
}): Promise<void> {
  await apiRequest('/api/auth/change-password', { method: 'POST', body: input })
}

export async function registerUser(input: {
  email: string
  password: string
  displayName?: string
}): Promise<CurrentUser & { mailed: boolean }> {
  clearCsrfToken()
  await ensureCsrfToken()
  return apiRequest<CurrentUser & { mailed: boolean }>('/api/auth/register', {
    method: 'POST',
    body: input,
  })
}

export async function loginUser(input: {
  email: string
  password: string
  rememberMe?: boolean
}): Promise<CurrentUser | { requiresTwoFactor: true }> {
  clearCsrfToken()
  await ensureCsrfToken()
  const result = await apiRequest<CurrentUser | { requiresTwoFactor: true }>('/api/auth/login', {
    method: 'POST',
    body: input,
  })
  clearCsrfToken()
  await ensureCsrfToken()
  return result
}

/**
 * ADR-0047: managed members without an email sign in as `handle@slug`. Handle and
 * slug are sent separately to the dedicated endpoint; it never consults emails.
 */
export async function loginWithHandle(input: {
  slug: string
  handle: string
  password: string
  rememberMe?: boolean
}): Promise<CurrentUser | { requiresTwoFactor: true }> {
  clearCsrfToken()
  await ensureCsrfToken()
  const result = await apiRequest<CurrentUser | { requiresTwoFactor: true }>(
    `/api/auth/login/handle/${encodeURIComponent(input.slug)}`,
    { method: 'POST', body: { handle: input.handle, password: input.password, rememberMe: input.rememberMe } },
  )
  clearCsrfToken()
  await ensureCsrfToken()
  return result
}

/** T-AU-02: narrows the login union to the 2FA second-step shape. */
export function isSecondStepRequired(
  value: CurrentUser | { requiresTwoFactor: true },
): value is { requiresTwoFactor: true } {
  return (value as { requiresTwoFactor?: unknown }).requiresTwoFactor === true
}

export async function logoutUser(): Promise<void> {
  await apiRequest<void>('/api/auth/logout', { method: 'POST' })
  clearCsrfToken()
}

/** T-AU-01: mailbox verification + password recovery. */
export async function confirmEmail(input: {
  email: string
  token: string
}): Promise<{ emailConfirmed: boolean }> {
  return apiRequest<{ emailConfirmed: boolean }>('/api/auth/confirm-email', {
    method: 'POST',
    body: input,
  })
}

export async function resendConfirmation(
  email: string,
): Promise<{ accepted: boolean; mailed: boolean }> {
  return apiRequest<{ accepted: boolean; mailed: boolean }>(
    '/api/auth/resend-confirmation',
    { method: 'POST', body: { email } },
  )
}

export async function forgotPassword(
  email: string,
): Promise<{ accepted: boolean; mailed: boolean }> {
  return apiRequest<{ accepted: boolean; mailed: boolean }>('/api/auth/forgot-password', {
    method: 'POST',
    body: { email },
  })
}

export async function resetPassword(input: {
  email: string
  token: string
  newPassword: string
}): Promise<{ passwordReset: boolean }> {
  return apiRequest<{ passwordReset: boolean }>('/api/auth/reset-password', {
    method: 'POST',
    body: input,
  })
}

/** T-AU-02: TOTP two-factor authentication (ADR-0038 S2). */
export type TwoFactorStatus = {
  enabled: boolean
  hasPassword: boolean
}

export async function fetchTwoFactorStatus(): Promise<TwoFactorStatus> {
  return apiRequest<TwoFactorStatus>('/api/auth/2fa/status')
}

export async function startTwoFactorEnroll(): Promise<{ uri: string; manualKey: string }> {
  return apiRequest<{ uri: string; manualKey: string }>('/api/auth/2fa/enroll-start', {
    method: 'POST',
    body: {},
  })
}

export async function verifyTwoFactorEnroll(
  code: string,
): Promise<{ enabled: boolean; recoveryCodes: string[] }> {
  return apiRequest<{ enabled: boolean; recoveryCodes: string[] }>('/api/auth/2fa/enroll-verify', {
    method: 'POST',
    body: { code },
  })
}

export async function disableTwoFactor(password?: string): Promise<{ disabled: boolean }> {
  return apiRequest<{ disabled: boolean }>('/api/auth/2fa/disable', {
    method: 'POST',
    body: password === undefined ? {} : { password },
  })
}

export async function challengeTwoFactor(
  code: string,
  rememberMe = false,
): Promise<CurrentUser> {
  const user = await apiRequest<CurrentUser>('/api/auth/2fa/challenge', {
    method: 'POST',
    body: { code, rememberMe },
  })
  clearCsrfToken()
  await ensureCsrfToken()
  return user
}

export async function recoverTwoFactor(code: string): Promise<CurrentUser> {
  const user = await apiRequest<CurrentUser>('/api/auth/2fa/recover', {
    method: 'POST',
    body: { code },
  })
  clearCsrfToken()
  await ensureCsrfToken()
  return user
}

export async function regenerateRecoveryCodes(
  password?: string,
): Promise<{ recoveryCodes: string[] }> {
  return apiRequest<{ recoveryCodes: string[] }>('/api/auth/2fa/recovery-codes/regenerate', {
    method: 'POST',
    body: password === undefined ? {} : { password },
  })
}

/** T-AU-03: Passkeys / WebAuthn authentication (ADR-0038 S3). */
export type PasskeyItem = {
  id: string
  name: string
  createdAt: string
}

export type PasskeyRegistrationOptions = {
  challenge: string
  rpId: string
  rpName: string
  user: {
    id: string
    name: string
    displayName: string
  }
}

export type PasskeyLoginOptions = {
  challenge: string
  rpId: string
}

export async function fetchPasskeys(): Promise<PasskeyItem[]> {
  return apiRequest<PasskeyItem[]>('/api/auth/passkeys')
}

export async function startPasskeyRegistration(): Promise<PasskeyRegistrationOptions> {
  return apiRequest<PasskeyRegistrationOptions>('/api/auth/passkeys/register-start', {
    method: 'POST',
    body: {},
  })
}

export async function finishPasskeyRegistration(input: {
  attestationObject: string
  clientData: string
  deviceName?: string
}): Promise<{ registered: boolean; credentialId: string }> {
  return apiRequest<{ registered: boolean; credentialId: string }>('/api/auth/passkeys/register-finish', {
    method: 'POST',
    body: input,
  })
}

export async function deletePasskey(id: string): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`/api/auth/passkeys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function startPasskeyLogin(): Promise<PasskeyLoginOptions> {
  return apiRequest<PasskeyLoginOptions>('/api/auth/passkeys/login-start', {
    method: 'POST',
    body: {},
  })
}

export async function finishPasskeyLogin(input: {
  credentialId: string
  clientData: string
  authenticatorData: string
  signature: string
}): Promise<CurrentUser> {
  clearCsrfToken()
  await ensureCsrfToken()
  const user = await apiRequest<CurrentUser>('/api/auth/passkeys/login-finish', {
    method: 'POST',
    body: input,
  })
  clearCsrfToken()
  await ensureCsrfToken()
  return user
}

export type AuthProviders = {
  google: boolean
}

export async function fetchAuthProviders(): Promise<AuthProviders> {
  return apiRequest<AuthProviders>('/api/auth/providers')
}

/** Full-page navigation into the Google OAuth challenge (not a fetch). */
export function googleChallengeHref(next?: string | null): string {
  if (next) {
    return `/api/auth/google?next=${encodeURIComponent(next)}`
  }
  return '/api/auth/google'
}

export async function listMyGroups(): Promise<GroupSummary[]> {
  return apiRequest<GroupSummary[]>('/api/groups')
}

export type UpcomingActivity = {
  groupId: string
  groupName: string
  eventId: string
  title: string
  type: string
  startsAt: string
  /** The caller's RSVP response, or null when they have none (ADR-0053 addendum). */
  myResponse?: string | null
}

/** Upcoming events across every group the caller belongs to (ADR-0053). */
export async function listUpcomingActivity(): Promise<UpcomingActivity[]> {
  return apiRequest<UpcomingActivity[]>('/api/activity/upcoming')
}

/** Read-only general calendar: events across the caller's groups in a date range. */
export async function listCalendarEvents(from: string, to: string): Promise<UpcomingActivity[]> {
  return apiRequest<UpcomingActivity[]>(
    `/api/activity/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  )
}

/** ADR-0053 addendum: persist the profile display name ("Editar perfil"). */
export async function updateProfile(displayName: string): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/auth/me', {
    method: 'PATCH',
    body: { displayName },
  })
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

export type GroupBySlug = GroupDetail & { moved?: boolean }

/** Resolves a path slug to its group (current or historical, with `moved`). */
export async function getGroupBySlug(slug: string): Promise<GroupBySlug> {
  return apiRequest<GroupBySlug>(`/api/groups/by-slug/${encodeURIComponent(slug)}`)
}

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

export type MemberListItem = {
  userId: string
  displayName: string
  role: string
  musicalRole?: string | null
  createdAt: string
  lastSeenAt?: string | null
  email?: string | null
}

export async function listMembers(groupId: string): Promise<MemberListItem[]> {
  const payload = await apiRequest<{ items: MemberListItem[] }>(`/api/groups/${groupId}/members`)
  return payload.items
}

/** ADR-0055 W-E: best-effort presence heartbeat (throttled server-side). */
export async function presenceHeartbeat(): Promise<void> {
  await apiRequest('/api/presence/heartbeat', { method: 'POST' })
}

/** ADR-0055 W-G: group tasks. */
export type TaskItem = {
  id: string
  title: string
  notes: string | null
  status: string
  dueAt: string | null
  assigneeUserId: string | null
  createdByUserId: string
  createdAt: string
  updatedAt: string
  version: number
}

export async function listTasks(groupId: string): Promise<TaskItem[]> {
  return apiRequest<TaskItem[]>(`/api/groups/${groupId}/tasks`)
}

export async function createTask(
  groupId: string,
  input: { title: string; notes?: string | null; dueAt?: string | null; assigneeUserId?: string | null },
): Promise<TaskItem> {
  return apiRequest<TaskItem>(`/api/groups/${groupId}/tasks`, { method: 'POST', body: input })
}

export async function updateTask(
  groupId: string,
  taskId: string,
  input: { title: string; notes?: string | null; dueAt?: string | null; assigneeUserId?: string | null; expectedVersion: number },
): Promise<TaskItem> {
  return apiRequest<TaskItem>(`/api/groups/${groupId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: input,
  })
}

export async function setTaskStatus(
  groupId: string,
  taskId: string,
  input: { status: string; expectedVersion: number },
): Promise<TaskItem> {
  return apiRequest<TaskItem>(`/api/groups/${groupId}/tasks/${taskId}/status`, {
    method: 'POST',
    body: input,
  })
}

export async function deleteTask(groupId: string, taskId: string, expectedVersion: number): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/tasks/${taskId}`, {
    method: 'DELETE',
    body: { expectedVersion },
  })
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' })
}

export async function changeMemberRole(
  groupId: string,
  userId: string,
  role: 'Owner' | 'Manager' | 'Member' | 'Viewer',
): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/members/${userId}/role`, {
    method: 'POST',
    body: { role },
  })
}

/** ADR-0051: Owner or Manager sets a member's descriptive musical role (null clears it). */
export async function setMemberMusicalRole(
  groupId: string,
  userId: string,
  musicalRole: string | null,
): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/members/${userId}/musical-role`, {
    method: 'PUT',
    body: { musicalRole },
  })
}

export async function leaveGroup(groupId: string): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/leave`, { method: 'POST' })
}

export type OutstandingInvitation = {
  id: string
  createdAt: string
  expiresAt: string
}

export async function listInvitations(groupId: string): Promise<OutstandingInvitation[]> {
  const payload = await apiRequest<{ items: OutstandingInvitation[] }>(
    `/api/groups/${groupId}/invitations`,
  )
  return payload.items
}

export async function revokeInvitation(groupId: string, invitationId: string): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/invitations/${invitationId}`, { method: 'DELETE' })
}

export type InvitationCreated = {
  id: string
  token: string
  expiresAt: string
  emailed: boolean
}

export type InvitationAccepted = {
  groupId: string
  role: string
}

export async function createInvitation(
  groupId: string,
  email?: string,
): Promise<InvitationCreated> {
  const trimmed = email?.trim()
  return apiRequest<InvitationCreated>(`/api/groups/${groupId}/invitations`, {
    method: 'POST',
    body: trimmed ? { email: trimmed } : {},
  })
}

export async function acceptInvitation(token: string): Promise<InvitationAccepted> {
  return apiRequest<InvitationAccepted>(
    `/api/invitations/${encodeURIComponent(token)}/accept`,
    { method: 'POST' },
  )
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

export type SongOriginKind = 'original' | 'cover' | 'other'

export type SongListItem = {
  id: string
  title: string
  attribution: string | null
  originKind: SongOriginKind
  version: number
  createdAt: string
  updatedAt: string
  tags: string[]
  isFavorite: boolean
}

export type SongDetail = SongListItem & {
  rightsNotes: string | null
  arrangementCount: number
}

export type ResourcePurpose =
  | 'chart'
  | 'lyrics'
  | 'audio'
  | 'click'
  | 'reference'
  | 'practice'
  | 'other'

export type ResourceSummary = {
  id: string
  arrangementId: string
  kind: string
  purpose: ResourcePurpose | string
  label: string
  part: string | null
  note: string | null
  url: string | null
  originalFileName?: string | null
  contentType?: string | null
  byteSize?: number | null
  createdAt: string
}

export type ArrangementListItem = {
  id: string
  songId: string
  label: string
  defaultKey: string | null
  defaultBpm: number | null
  version: number
  createdAt: string
  updatedAt: string
}

export type ArrangementDetail = ArrangementListItem & {
  lyrics: string | null
  chords: string | null
  structure: string | null
  notes: string | null
  /** ADR-0031: JSON array of `{ lineIndex, atMs }` or null when unset. */
  chordTimingJson: string | null
  resources: ResourceSummary[]
}

export type ResourceDetail = ResourceSummary

export async function listSongs(groupId: string): Promise<SongListItem[]> {
  return apiRequest<SongListItem[]>(`/api/groups/${groupId}/songs`)
}

export async function createSong(
  groupId: string,
  input: {
    title: string
    originKind: SongOriginKind
    attribution?: string | null
    rightsNotes?: string | null
    tags?: string[]
  },
): Promise<SongDetail> {
  return apiRequest<SongDetail>(`/api/groups/${groupId}/songs`, {
    method: 'POST',
    body: input,
  })
}

export async function getSong(groupId: string, songId: string): Promise<SongDetail> {
  return apiRequest<SongDetail>(`/api/groups/${groupId}/songs/${songId}`)
}

export async function updateSong(
  groupId: string,
  songId: string,
  input: {
    expectedVersion: number
    title?: string | null
    originKind?: SongOriginKind | null
    attribution?: string | null
    rightsNotes?: string | null
    tags?: string[]
  },
): Promise<SongDetail> {
  return apiRequest<SongDetail>(`/api/groups/${groupId}/songs/${songId}`, {
    method: 'PATCH',
    body: input,
  })
}

export async function deleteSong(
  groupId: string,
  songId: string,
  expectedVersion: number,
): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/songs/${songId}`, {
    method: 'DELETE',
    body: { expectedVersion },
  })
}

export async function listArrangements(
  groupId: string,
  songId: string,
): Promise<ArrangementListItem[]> {
  return apiRequest<ArrangementListItem[]>(
    `/api/groups/${groupId}/songs/${songId}/arrangements`,
  )
}

export async function createArrangement(
  groupId: string,
  songId: string,
  input: {
    label: string
    defaultKey?: string | null
    defaultBpm?: number | null
    lyrics?: string | null
    chords?: string | null
    structure?: string | null
    notes?: string | null
  },
): Promise<ArrangementDetail> {
  return apiRequest<ArrangementDetail>(
    `/api/groups/${groupId}/songs/${songId}/arrangements`,
    { method: 'POST', body: input },
  )
}

export async function getArrangement(
  groupId: string,
  arrangementId: string,
): Promise<ArrangementDetail> {
  return apiRequest<ArrangementDetail>(
    `/api/groups/${groupId}/arrangements/${arrangementId}`,
  )
}

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

export type LrcPreview = {
  encoding: string
  lyrics: string
  chordTimingJson: string | null
  markCount: number
  metadata: {
    title: string | null
    artist: string | null
    album: string | null
    by: string | null
    offsetMs: number
  }
  warnings: string[]
  errors: Array<{ line: number; reason: string }>
}

/** Preview only: the API never persists on import (ADR-0050). */
export async function importArrangementLrc(
  groupId: string,
  arrangementId: string,
  input: { content?: string; contentBase64?: string; offsetMs?: number },
): Promise<LrcPreview> {
  return apiRequest<LrcPreview>(
    `/api/groups/${groupId}/arrangements/${arrangementId}/lyrics/import-lrc`,
    { method: 'POST', body: input },
  )
}

/** Returns the raw .lrc text (plain text, not JSON). */
export async function exportArrangementLrc(
  groupId: string,
  arrangementId: string,
): Promise<string> {
  const response = await fetch(
    `/api/groups/${groupId}/arrangements/${arrangementId}/lyrics/export.lrc`,
    { credentials: 'include' },
  )
  if (!response.ok) {
    throw new ApiError(`export failed (${response.status})`, response.status)
  }
  return response.text()
}

export async function updateArrangement(
  groupId: string,
  arrangementId: string,
  input: {
    expectedVersion: number
    label?: string | null
    defaultKey?: string | null
    defaultBpm?: number | null
    lyrics?: string | null
    chords?: string | null
    structure?: string | null
    notes?: string | null
    /** null omits; "" / "[]" clears; valid JSON array replaces (T-SYNC-01). */
    chordTimingJson?: string | null
  },
): Promise<ArrangementDetail> {
  return apiRequest<ArrangementDetail>(
    `/api/groups/${groupId}/arrangements/${arrangementId}`,
    { method: 'PATCH', body: input },
  )
}

export async function deleteArrangement(
  groupId: string,
  arrangementId: string,
  expectedVersion: number,
): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/arrangements/${arrangementId}`, {
    method: 'DELETE',
    body: { expectedVersion },
  })
}

export async function listResources(
  groupId: string,
  arrangementId: string,
): Promise<ResourceSummary[]> {
  return apiRequest<ResourceSummary[]>(
    `/api/groups/${groupId}/arrangements/${arrangementId}/resources`,
  )
}

/** ADR-0055 W-D: aggregated group material library (member read). */
export type GroupResourceItem = {
  id: string
  arrangementId: string
  songId: string
  songTitle: string
  arrangementLabel: string
  kind: string
  purpose: string
  label: string
  part: string | null
  note: string | null
  url: string | null
  originalFileName: string | null
  contentType: string | null
  byteSize: number | null
  createdAt: string
}

export async function listGroupResources(groupId: string): Promise<GroupResourceItem[]> {
  return apiRequest<GroupResourceItem[]>(`/api/groups/${groupId}/resources`)
}

export async function createLinkResource(
  groupId: string,
  arrangementId: string,
  input: {
    purpose: ResourcePurpose
    label: string
    url: string
    part?: string | null
    note?: string | null
  },
): Promise<ResourceDetail> {
  return apiRequest<ResourceDetail>(
    `/api/groups/${groupId}/arrangements/${arrangementId}/resources`,
    {
      method: 'POST',
      body: {
        kind: 'link',
        purpose: input.purpose,
        label: input.label,
        url: input.url,
        part: input.part,
        note: input.note,
      },
    },
  )
}

export async function createFileResource(
  groupId: string,
  arrangementId: string,
  input: {
    purpose: ResourcePurpose
    label: string
    file: File
    part?: string | null
    note?: string | null
  },
): Promise<ResourceDetail> {
  const form = new FormData()
  form.append('purpose', input.purpose)
  form.append('label', input.label)
  if (input.part) form.append('part', input.part)
  if (input.note) form.append('note', input.note)
  form.append('file', input.file)

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-CSRF-TOKEN': await ensureCsrfToken(),
  }

  const response = await fetch(
    `/api/groups/${groupId}/arrangements/${arrangementId}/resources`,
    {
      method: 'POST',
      credentials: 'include',
      headers,
      body: form,
    },
  )

  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    throw new ApiError(`Request failed: ${response.status}`, response.status, body)
  }

  return (await response.json()) as ResourceDetail
}

export function resourceContentUrl(
  groupId: string,
  arrangementId: string,
  resourceId: string,
): string {
  return `/api/groups/${groupId}/arrangements/${arrangementId}/resources/${resourceId}/content`
}

export async function getResource(
  groupId: string,
  arrangementId: string,
  resourceId: string,
): Promise<ResourceDetail> {
  return apiRequest<ResourceDetail>(
    `/api/groups/${groupId}/arrangements/${arrangementId}/resources/${resourceId}`,
  )
}

export async function updateLinkResource(
  groupId: string,
  arrangementId: string,
  resourceId: string,
  input: {
    purpose?: ResourcePurpose | null
    label?: string | null
    part?: string | null
    note?: string | null
  },
): Promise<ResourceDetail> {
  return apiRequest<ResourceDetail>(
    `/api/groups/${groupId}/arrangements/${arrangementId}/resources/${resourceId}`,
    { method: 'PATCH', body: input },
  )
}

export type SetlistListItem = {
  id: string
  name: string
  version: number
  itemCount: number
  createdAt: string
  updatedAt: string
}

export type SetlistItem = {
  id: string
  arrangementId: string
  sortOrder: number
  songTitle: string | null
  arrangementLabel: string | null
}

export type SetlistDetail = {
  id: string
  name: string
  version: number
  createdAt: string
  updatedAt: string
  items: SetlistItem[]
}

export type EventType = 'rehearsal' | 'performance' | 'other'

export type EventListItem = {
  id: string
  title: string
  type: EventType | string
  startsAt: string
  status: string
  version: number
  createdAt: string
  updatedAt: string
}

export type EventPlanItem = {
  id: string
  arrangementId: string
  sortOrder: number
  displaySongTitle: string
  displayArrangementLabel: string
}

export type EventDetail = {
  id: string
  title: string
  type: EventType | string
  startsAt: string
  status: string
  version: number
  createdAt: string
  updatedAt: string
  sourceSetlistId: string | null
  items: EventPlanItem[]
}

export async function listSetlists(groupId: string): Promise<SetlistListItem[]> {
  return apiRequest<SetlistListItem[]>(`/api/groups/${groupId}/setlists`)
}

export async function createSetlist(groupId: string, name: string): Promise<SetlistDetail> {
  return apiRequest<SetlistDetail>(`/api/groups/${groupId}/setlists`, {
    method: 'POST',
    body: { name },
  })
}

export async function getSetlist(groupId: string, setlistId: string): Promise<SetlistDetail> {
  return apiRequest<SetlistDetail>(`/api/groups/${groupId}/setlists/${setlistId}`)
}

export async function renameSetlist(
  groupId: string,
  setlistId: string,
  expectedVersion: number,
  name: string,
): Promise<SetlistDetail> {
  return apiRequest<SetlistDetail>(`/api/groups/${groupId}/setlists/${setlistId}`, {
    method: 'PATCH',
    body: { expectedVersion, name },
  })
}

export async function replaceSetlistItems(
  groupId: string,
  setlistId: string,
  expectedVersion: number,
  items: { arrangementId: string; sortOrder: number }[],
): Promise<SetlistDetail> {
  return apiRequest<SetlistDetail>(`/api/groups/${groupId}/setlists/${setlistId}/items`, {
    method: 'PUT',
    body: { expectedVersion, items },
  })
}

export async function listEvents(groupId: string): Promise<EventListItem[]> {
  return apiRequest<EventListItem[]>(`/api/groups/${groupId}/events`)
}

export async function createEvent(
  groupId: string,
  input: { title: string; type: EventType; startsAt: string },
): Promise<EventDetail> {
  return apiRequest<EventDetail>(`/api/groups/${groupId}/events`, {
    method: 'POST',
    body: input,
  })
}

export async function getEvent(groupId: string, eventId: string): Promise<EventDetail> {
  return apiRequest<EventDetail>(`/api/groups/${groupId}/events/${eventId}`)
}

export async function patchEvent(
  groupId: string,
  eventId: string,
  input: { expectedVersion: number; title?: string; type?: EventType; startsAt?: string },
): Promise<EventDetail> {
  return apiRequest<EventDetail>(`/api/groups/${groupId}/events/${eventId}`, {
    method: 'PATCH',
    body: input,
  })
}

export async function cancelEvent(
  groupId: string,
  eventId: string,
  expectedVersion: number,
): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/events/${eventId}/cancel`, {
    method: 'POST',
    body: { expectedVersion },
  })
}

export async function duplicateEvent(
  groupId: string,
  eventId: string,
  expectedVersion: number,
): Promise<EventDetail> {
  return apiRequest<EventDetail>(
    `/api/groups/${groupId}/events/${eventId}/duplicate`,
    { method: 'POST', body: { expectedVersion } },
  )
}

export async function deleteEvent(
  groupId: string,
  eventId: string,
  expectedVersion: number,
): Promise<void> {
  await apiRequest<void>(
    `/api/groups/${groupId}/events/${eventId}?expectedVersion=${expectedVersion}`,
    { method: 'DELETE' },
  )
}

export async function applySetlistToEvent(
  groupId: string,
  eventId: string,
  input: { setlistId: string; expectedVersion: number; confirmReplace?: boolean },
): Promise<EventDetail> {
  return apiRequest<EventDetail>(
    `/api/groups/${groupId}/events/${eventId}/apply-setlist`,
    { method: 'POST', body: input },
  )
}

export type EventRsvpResponse = 'yes' | 'no' | 'maybe'

export type EventRsvpItem = {
  userId: string
  displayName: string
  response: EventRsvpResponse | string
  updatedAt: string
}

export type EventRsvpList = {
  items: EventRsvpItem[]
}

export type EventRsvpUpsertResult = {
  userId: string
  response: EventRsvpResponse | string
  updatedAt: string
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

export async function listEventRsvps(
  groupId: string,
  eventId: string,
): Promise<EventRsvpList> {
  return apiRequest<EventRsvpList>(`/api/groups/${groupId}/events/${eventId}/rsvps`)
}

export async function deleteResource(
  groupId: string,
  arrangementId: string,
  resourceId: string,
): Promise<void> {
  await apiRequest<void>(
    `/api/groups/${groupId}/arrangements/${arrangementId}/resources/${resourceId}`,
    { method: 'DELETE' },
  )
}

export type DigitizeSegment = {
  startMs: number
  endMs: number
  text: string
}

export type DigitizeJobStatus = 'queued' | 'processing' | 'done' | 'failed'

export type DigitizeJob = {
  jobId: string
  status: DigitizeJobStatus
  segments: DigitizeSegment[] | null
  error: string | null
}

export async function startDigitizeJob(
  groupId: string,
  arrangementId: string,
  resourceId: string,
): Promise<{ jobId: string; status: DigitizeJobStatus }> {
  return apiRequest<{ jobId: string; status: DigitizeJobStatus }>(
    `/api/groups/${groupId}/arrangements/${arrangementId}/digitize`,
    { method: 'POST', body: { resourceId } },
  )
}

export async function getDigitizeJob(
  groupId: string,
  arrangementId: string,
  jobId: string,
): Promise<DigitizeJob> {
  return apiRequest<DigitizeJob>(
    `/api/groups/${groupId}/arrangements/${arrangementId}/digitize/${jobId}`,
  )
}
