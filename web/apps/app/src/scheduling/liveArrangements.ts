import { listArrangements, listSongs } from '../api/client'

export type LiveArrangementOption = {
  arrangementId: string
  songTitle: string
  arrangementLabel: string
}

export function formatArrangementOption(option: LiveArrangementOption): string {
  return `${option.songTitle} — ${option.arrangementLabel}`
}

export async function loadLiveArrangementOptions(
  groupId: string,
): Promise<LiveArrangementOption[]> {
  const songs = await listSongs(groupId)
  const nested = await Promise.all(
    songs.map(async (song) => {
      const arrangements = await listArrangements(groupId, song.id)
      return arrangements.map((arrangement) => ({
        arrangementId: arrangement.id,
        songTitle: song.title,
        arrangementLabel: arrangement.label,
      }))
    }),
  )
  return nested.flat()
}
