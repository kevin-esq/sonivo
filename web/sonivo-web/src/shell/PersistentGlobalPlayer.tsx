import { useAudioPlayer } from '../repertoire/AudioPlayerContext'
import { Play, Pause, Volume2, Music2 } from 'lucide-react'

export function PersistentGlobalPlayer() {
  const { currentTrack, isPlaying, progress, duration, volume, togglePlay, seek, setVolume } = useAudioPlayer()

  if (!currentTrack) return null

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 text-white px-6 flex items-center justify-between z-50 shadow-2xl">
      <div className="flex items-center gap-3 w-1/4">
        <div className="w-10 h-10 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
          <Music2 size={20} />
        </div>
        <div className="truncate">
          <p className="font-semibold text-sm truncate">{currentTrack.title}</p>
          <p className="text-xs text-slate-400 truncate">{currentTrack.artist || 'Ensayo Sonivo'}</p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5 w-2/4 max-w-xl">
        <button
          type="button"
          onClick={togglePlay}
          className="p-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/30"
          aria-label={isPlaying ? 'Pausar reproducción' : 'Iniciar reproducción'}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>
        <div className="flex items-center gap-3 w-full text-xs text-slate-400">
          <span>{formatTime(progress)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={progress}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            aria-label="Progreso de reproducción de audio"
          />
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 w-1/4">
        <Volume2 size={18} className="text-slate-400" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-24 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          aria-label="Control de volumen de audio"
        />
      </div>
    </div>
  )
}
