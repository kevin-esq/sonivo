import { ApiError, apiRequest, ensureCsrfToken } from './http'

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

export type ResourceDetail = ResourceSummary

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
