import { listArrangements, listGroupResources, listSongs } from '../api/client'
import type { GroupResourceItem } from '../api/resources'
import { isPlayableAudioResource } from '../repertoire/pickPracticeAudio'

export type LiveArrangementOption = {
  songId: string
  arrangementId: string
  songTitle: string
  arrangementLabel: string
  audioResources: GroupResourceItem[]
}

export function formatArrangementOption(option: LiveArrangementOption): string {
  return `${option.songTitle} — ${option.arrangementLabel}`
}

export async function loadLiveArrangementOptions(
  groupId: string,
): Promise<LiveArrangementOption[]> {
  const [songs, resources] = await Promise.all([listSongs(groupId), listGroupResources(groupId)])
  const nested = await Promise.all(songs.map(async (song) => {
      const arrangements = await listArrangements(groupId, song.id)
      return arrangements.map((arrangement) => ({
        songId: song.id,
        arrangementId: arrangement.id,
        songTitle: song.title,
        arrangementLabel: arrangement.label,
        audioResources: resources.filter((resource) => resource.arrangementId === arrangement.id
          && (resource.purpose === 'audio' || resource.purpose === 'click')
          && isPlayableAudioResource(resource)),
      }))
    }))
  return nested.flat()
}
