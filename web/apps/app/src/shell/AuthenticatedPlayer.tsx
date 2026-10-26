'use client'

import { useEffect } from 'react'
import { useAudioPlayer } from '../repertoire/AudioPlayerContext'
import { PersistentGlobalPlayer } from './PersistentGlobalPlayer'

/** Keeps audio visible for authenticated sessions and stops playback on logout. */
export function AuthenticatedPlayer({ active }: { active: boolean }) {
  const { closeTrack } = useAudioPlayer()
  useEffect(() => {
    if (!active) closeTrack()
    // closeTrack is intentionally read only when the session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
  return active ? <PersistentGlobalPlayer /> : null
}
