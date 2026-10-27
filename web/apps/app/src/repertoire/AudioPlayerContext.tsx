import React, { createContext, useContext, useEffect, useState, useRef } from 'react'

export interface Track {
  id: string
  title: string
  artist?: string
  url: string
}

export type AudioPlaybackError = 'unsupported' | 'unavailable'

interface AudioPlayerContextType {
  currentTrack: Track | null
  isPlaying: boolean
  progress: number
  duration: number
  volume: number
  playbackError: AudioPlaybackError | null
  playTrack: (track: Track) => void
  /** Loads a paused track (no autoplay); used by surfaces such as Practice. */
  loadTrack: (track: Track) => void
  togglePlay: () => void
  closeTrack: () => void
  seek: (seconds: number) => void
  getCurrentTime: () => number
  setVolume: (vol: number) => void
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined)

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [duration, setDuration] = useState<number>(0)
  const [volume, setVolumeState] = useState<number>(0.8)
  const [playbackError, setPlaybackError] = useState<AudioPlaybackError | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playbackAttemptRef = useRef(0)

  const beginPlayback = (audio: HTMLAudioElement) => {
    const attempt = ++playbackAttemptRef.current
    void audio.play().then(() => {
      if (attempt !== playbackAttemptRef.current) return
      setPlaybackError(null)
      setIsPlaying(true)
    }).catch((error: unknown) => {
      if (attempt !== playbackAttemptRef.current) return
      if (error instanceof DOMException && error.name === 'AbortError') return
      setIsPlaying(false)
      setProgress(0)
      setDuration(0)
      setPlaybackError(error instanceof DOMException && error.name === 'NotSupportedError'
        ? 'unsupported'
        : 'unavailable')
    })
  }

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  const playTrack = (track: Track) => {
    setCurrentTrack(track)
    setIsPlaying(false)
    setPlaybackError(null)
    if (audioRef.current) {
      audioRef.current.src = track.url
      beginPlayback(audioRef.current)
    }
  }

  const loadTrack = (track: Track) => {
    setCurrentTrack(track)
    setIsPlaying(false)
    setProgress(0)
    setDuration(0)
    setPlaybackError(null)
    playbackAttemptRef.current += 1
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = track.url
      audioRef.current.load()
      audioRef.current.currentTime = 0
    }
  }

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      setPlaybackError(null)
      beginPlayback(audioRef.current)
    }
  }

  const seek = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds
      setProgress(seconds)
    }
  }

  const setVolume = (vol: number) => {
    setVolumeState(vol)
    if (audioRef.current) audioRef.current.volume = vol
  }

  const closeTrack = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
    }
    setCurrentTrack(null)
    setIsPlaying(false)
    setProgress(0)
    setDuration(0)
    setPlaybackError(null)
    playbackAttemptRef.current += 1
  }

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        progress,
        duration,
        volume,
        playbackError,
        playTrack,
        loadTrack,
        togglePlay,
        closeTrack,
        seek,
        getCurrentTime: () => audioRef.current?.currentTime ?? progress,
        setVolume,
      }}
    >
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={() => setProgress(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onError={() => {
          setIsPlaying(false)
          setProgress(0)
          setDuration(0)
          setPlaybackError(audioRef.current?.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
            ? 'unsupported'
            : 'unavailable')
        }}
        onEnded={() => setIsPlaying(false)}
      />
    </AudioPlayerContext.Provider>
  )
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext)
  if (!context) throw new Error('useAudioPlayer must be used within AudioPlayerProvider')
  return context
}
