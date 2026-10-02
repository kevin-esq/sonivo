import React, { createContext, useContext, useState, useRef } from 'react'

export interface Track {
  id: string
  title: string
  artist?: string
  url: string
}

interface AudioPlayerContextType {
  currentTrack: Track | null
  isPlaying: boolean
  progress: number
  duration: number
  volume: number
  playTrack: (track: Track) => void
  /** Carga una pista en pausa (sin autoplay); la usan superficies como Practicar. */
  loadTrack: (track: Track) => void
  togglePlay: () => void
  closeTrack: () => void
  seek: (seconds: number) => void
  setVolume: (vol: number) => void
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined)

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [duration, setDuration] = useState<number>(0)
  const [volume, setVolumeState] = useState<number>(0.8)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playTrack = (track: Track) => {
    setCurrentTrack(track)
    setIsPlaying(true)
    if (audioRef.current) {
      audioRef.current.src = track.url
      void audioRef.current.play()
    }
  }

  const loadTrack = (track: Track) => {
    setCurrentTrack(track)
    setIsPlaying(false)
    setProgress(0)
    setDuration(0)
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
      void audioRef.current.play()
      setIsPlaying(true)
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
  }

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        progress,
        duration,
        volume,
        playTrack,
        loadTrack,
        togglePlay,
        closeTrack,
        seek,
        setVolume,
      }}
    >
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={() => setProgress(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => setIsPlaying(false)}
      />
    </AudioPlayerContext.Provider>
  )
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext)
  if (!context) throw new Error('useAudioPlayer debe ser usado dentro de AudioPlayerProvider')
  return context
}
