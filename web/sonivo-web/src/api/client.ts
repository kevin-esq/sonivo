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
  createdAt: string
}

export async function listMembers(groupId: string): Promise<MemberListItem[]> {
  const payload = await apiRequest<{ items: MemberListItem[] }>(`/api/groups/${groupId}/members`)
  return payload.items
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' })
}

export async function changeMemberRole(
  groupId: string,
  userId: string,
  role: 'Owner' | 'Member',
): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/members/${userId}/role`, {
    method: 'POST',
    body: { role },
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
