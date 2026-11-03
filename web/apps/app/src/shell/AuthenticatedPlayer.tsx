'use client'

import { useEffect } from 'react'
import { useAudioPlayer } from '../repertoire/AudioPlayerContext'
import { PersistentGlobalPlayer } from './PersistentGlobalPlayer'

/** Shows playback controls on repertoire audio surfaces and closes them elsewhere. */
export function AuthenticatedPlayer({ active, pathname }: { active: boolean; pathname: string }) {
  const { closeTrack } = useAudioPlayer()
  const playbackArea = /^\/app\/(?:groups\/[^/]+|g\/[^/]+)\/(?:library|songs\/[^/]+|arrangements\/[^/]+)(?:\/.*)?\/?$/.test(pathname)
  useEffect(() => {
    if (!active || !playbackArea) closeTrack()
    // closeTrack is needed only when session or playback-area state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, playbackArea])
  return active && playbackArea ? <PersistentGlobalPlayer /> : null
}
