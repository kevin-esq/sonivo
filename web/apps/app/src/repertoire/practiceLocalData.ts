export type PracticeBookmark = {
  id: string
  time: number
  label: string
}

export type PracticeLocalData = {
  likedTrackIds: string[]
  bookmarksByTrack: Record<string, PracticeBookmark[]>
}

const PREFIX = 'sonivo.practice.local'

export function emptyPracticeLocalData(): PracticeLocalData {
  return { likedTrackIds: [], bookmarksByTrack: {} }
}

function storageKey(userId: string, groupId: string, songId: string): string {
  return `${PREFIX}:${userId}:${groupId}:${songId}`
}

export function readPracticeLocalData(
  userId: string,
  groupId: string,
  songId: string,
): PracticeLocalData {
  try {
    const raw = localStorage.getItem(storageKey(userId, groupId, songId))
    if (!raw) return emptyPracticeLocalData()
    const parsed = JSON.parse(raw) as Partial<PracticeLocalData>
    const bookmarksByTrack: Record<string, PracticeBookmark[]> = {}
    if (parsed.bookmarksByTrack && typeof parsed.bookmarksByTrack === 'object') {
      for (const [trackId, value] of Object.entries(parsed.bookmarksByTrack)) {
        if (!Array.isArray(value)) continue
        bookmarksByTrack[trackId] = value.filter((mark): mark is PracticeBookmark =>
          Boolean(mark) &&
          typeof mark.id === 'string' &&
          typeof mark.label === 'string' &&
          typeof mark.time === 'number' &&
          Number.isFinite(mark.time) &&
          mark.time >= 0,
        )
      }
    }
    return {
      likedTrackIds: Array.isArray(parsed.likedTrackIds)
        ? parsed.likedTrackIds.filter((id): id is string => typeof id === 'string')
        : [],
      bookmarksByTrack,
    }
  } catch {
    return emptyPracticeLocalData()
  }
}

export function writePracticeLocalData(
  userId: string,
  groupId: string,
  songId: string,
  data: PracticeLocalData,
): void {
  try {
    localStorage.setItem(storageKey(userId, groupId, songId), JSON.stringify(data))
  } catch {
    // Quota / private mode — keep changes in memory for this session.
  }
}
