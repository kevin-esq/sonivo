'use client'

import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import { playMidiNote } from './harmonySoundfont'

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const BLACK_NOTES = new Set([1, 3, 6, 8, 10])
const FIRST_MIDI_NOTE = 57
const LAST_MIDI_NOTE = 81
const PIANO_NOTE_NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B']
let audioContext: AudioContext | null = null
const pianoSamples = new Map<number, AudioBuffer>()

function notePitch(name: string) {
  const match = name.match(/^([A-G])([#b♯♭]?)/)
  if (!match) return null
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  return (base[match[1]!]! + (match[2] === '#' || match[2] === '♯' ? 1 : match[2] === 'b' || match[2] === '♭' ? -1 : 0) + 12) % 12
}

function chordPitches(chord: string) {
  const match = chord.match(/^([A-G](?:#|b|♯|♭)?)(.*)$/)
  if (!match) return []
  const root = notePitch(match[1]!)
  if (root == null) return []
  const suffix = match[2]!.toLowerCase()
  const third = /^(m|min|−)/.test(suffix) && !/maj/.test(suffix) ? 3 : 4
  const fifth = /dim|°/.test(suffix) ? 6 : /aug|\+/.test(suffix) ? 8 : 7
  const pitches = [root, (root + third) % 12, (root + fifth) % 12]
  if (/7/.test(suffix)) pitches.push((root + (/maj7|mmaj7/.test(suffix) ? 11 : 10)) % 12)
  return pitches
}

async function previewNote(midi: number) {
  try {
    await playMidiNote(midi, 15)
    return
  } catch {
    // Keep local piano samples available when AudioWorklet or SoundFont loading fails.
  }
  const context = audioContext ??= new AudioContext()
  await context.resume()
  let sample = pianoSamples.get(midi)
  if (!sample) {
    const pitchClass = PIANO_NOTE_NAMES[midi % 12]!
    const octave = Math.floor(midi / 12) - 1
    const response = await fetch(`/audio/practice/warmup/INSPiano_Vel03_${pitchClass}${octave}_01.ogg`)
    if (!response.ok) throw new Error('Piano sample unavailable')
    sample = await context.decodeAudioData(await response.arrayBuffer())
    pianoSamples.set(midi, sample)
  }
  const source = context.createBufferSource()
  const gain = context.createGain()
  const now = context.currentTime
  source.buffer = sample
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.7, now + 0.012)
  gain.gain.setValueAtTime(0.7, now + Math.max(0.012, sample.duration - 0.08))
  gain.gain.exponentialRampToValueAtTime(0.0001, now + sample.duration)
  source.connect(gain).connect(context.destination)
  source.start(now)
  source.stop(now + sample.duration)
}

export function HarmonyPianoKeyboard({ chord }: { chord: string }) {
  const { t } = useT()
  const [audioError, setAudioError] = useState(false)
  const chordNotes = useMemo(() => chordPitches(chord), [chord])
  const keys = Array.from({ length: LAST_MIDI_NOTE - FIRST_MIDI_NOTE + 1 }, (_, index) => {
    const midi = FIRST_MIDI_NOTE + index
    const pitch = midi % 12
    const isBlack = BLACK_NOTES.has(pitch)
    return { midi, pitch, isBlack, name: NOTE_NAMES[pitch]!, octave: Math.floor(midi / 12) - 1 }
  })
  const whiteKeys = keys.filter(key => !key.isBlack)
  const keyWidth = 100 / whiteKeys.length
  const positionedKeys = keys.map(key => {
    const leftWhiteKeys = whiteKeys.filter(whiteKey => whiteKey.midi < key.midi).length
    return { ...key, left: (leftWhiteKeys - (key.isBlack ? 1 : 0) + (key.isBlack ? 0.68 : 0)) * keyWidth }
  })

  function playNote(midi: number) {
    setAudioError(false)
    void previewNote(midi).catch(() => setAudioError(true))
  }

  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-[#202020] p-4" aria-label={t('harmony.piano')}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t('harmony.piano')}</h2>
          <p className="mt-1 text-xs text-white/50">{t('harmony.pianoHint', { chord })}</p>
        </div>
        <span className="text-xs text-white/45">A3–A5</span>
      </header>
      {audioError ? <p role="alert" className="text-xs text-red-300">{t('harmony.pianoUnavailable')}</p> : null}
      <div className="relative h-36 overflow-hidden rounded-md bg-[#111]" role="group" aria-label={t('harmony.piano')}>
        {positionedKeys.filter(key => !key.isBlack).map(key => <button key={key.midi} type="button" aria-label={t('harmony.playNote', { note: `${key.name}${key.octave}` })} onClick={() => playNote(key.midi)} className={`absolute bottom-0 top-0 rounded-b border border-[#b5b5b5] transition-colors hover:bg-[#ffe1ae] ${chordNotes.includes(key.pitch) ? 'bg-[#ffc76b]' : 'bg-[#f7f4ee]'}`} style={{ left: `${key.left}%`, width: `${keyWidth}%` }}>
          <span className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-black/55">{key.name === 'C' || key.midi === FIRST_MIDI_NOTE || key.midi === LAST_MIDI_NOTE ? `${key.name}${key.octave}` : key.name}</span>
        </button>)}
        {positionedKeys.filter(key => key.isBlack).map(key => <button key={key.midi} type="button" aria-label={t('harmony.playNote', { note: `${key.name}${key.octave}` })} onClick={() => playNote(key.midi)} className={`absolute top-0 z-10 h-[62%] rounded-b border border-black shadow-md transition-colors hover:bg-[#d98b34] ${chordNotes.includes(key.pitch) ? 'bg-[#e8a23c]' : 'bg-[#242424]'}`} style={{ left: `${key.left}%`, width: `${keyWidth * 0.64}%` }} />)}
      </div>
    </section>
  )
}
