import { ApiError, apiRequest } from './http'
import type { ResourceSummary } from './resources'

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
