import { getHarmonyAudioEngine } from './harmonySoundfont'
import type { HarmonyProgression } from './harmonyProgression'

const NOTE_NUMBER: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 }
const CHANNEL: Record<HarmonyProgression['tracks'][number]['instrument'], number> = { chord: 0, piano: 1, guitar: 2, bass: 3, lead: 4, drums: 9 }
const PROGRAM: Record<Exclude<HarmonyProgression['tracks'][number]['instrument'], 'drums'>, number> = { chord: 0, piano: 0, guitar: 24, bass: 32, lead: 80 }

type NoteEvent = { at: number; channel: number; note: number; velocity: number; on: boolean }

export async function playHarmonyProgression(
  progression: HarmonyProgression,
  key: string,
  bpm: number,
  onEnded: () => void,
) {
  const { context, synth } = await getHarmonyAudioEngine()
  await context.resume()
  const normalizeNote = (note: string) => note.replace('♯', '#').replace('♭', 'b')
  const root = NOTE_NUMBER[normalizeNote(key.trim().match(/^[A-G](?:#|b|♯|♭)?/)?.[0] ?? 'C')] ?? 0
  const secondsPerTick = 60 / Math.max(1, bpm) / 4
  const enabledTracks = progression.tracks.filter((track) => track.enabled)
  const channels = new Map<number, number>()
  const events: NoteEvent[] = []
  let cursor = context.currentTime + 0.08

  const addNote = (channel: number, midi: number, at: number, length: number, volume: number) => {
    events.push(
      { at, channel, note: midi, velocity: Math.max(1, Math.min(127, Math.round(volume * 120))), on: true },
      { at: at + Math.max(0.04, length), channel, note: midi, velocity: 0, on: false },
    )
  }

  const notesFor = (symbol: string, octave: number) => {
    const match = symbol.match(/^([A-G](?:#|b|♯|♭)?)(.*)$/)
    const pitch = match ? NOTE_NUMBER[normalizeNote(match[1]!)] : null
    if (pitch == null) return [root + octave * 12 + 60, root + octave * 12 + 64, root + octave * 12 + 67]
    const suffix = match![2]!.toLowerCase()
    const third = /^(m|min|−)/.test(suffix) && !/maj/.test(suffix) ? 3 : 4
    const fifth = /dim|°/.test(suffix) ? 6 : /aug|\+/.test(suffix) ? 8 : 7
    const base = 12 * (octave + 1) + pitch
    return [base, base + third, base + fifth]
  }

  const schedule = (instrument: Exclude<HarmonyProgression['tracks'][number]['instrument'], 'drums'>, symbol: string, at: number, length: number, volume: number) => {
    const channel = CHANNEL[instrument]
    const chord = notesFor(symbol, instrument === 'bass' ? 2 : instrument === 'lead' ? 5 : 4)
    channels.set(channel, PROGRAM[instrument])
    if (instrument === 'bass') {
      addNote(channel, chord[0]! - 12, at, length, volume)
    } else if (instrument === 'lead') {
      chord.forEach((note, index) => addNote(channel, note + 12, at + index * Math.min(0.07, length / 8), length * 0.55, volume))
    } else {
      const strum = instrument === 'guitar' ? 0.035 : 0
      chord.forEach((note, index) => addNote(channel, note, at + index * strum, length, volume / Math.sqrt(chord.length)))
    }
  }

  for (const section of progression.sections) {
    for (const bar of section.bars) {
      const barStart = cursor
      let tick = 0
      const barTicks = progression.meter.numerator * 16 / progression.meter.denominator
      for (const slot of bar) {
        const duration = Math.min(slot.durationTicks, Math.max(0, barTicks - tick))
        if (!duration) continue
        for (const track of enabledTracks) {
          const at = barStart + tick * secondsPerTick
          const length = duration * secondsPerTick * (track.pattern === 'sustain' ? 0.94 : 0.58)
          if (track.instrument === 'drums') continue
          if (track.pattern === 'accompaniment' && ['piano', 'guitar'].includes(track.instrument)) {
            const beatTicks = 16 / progression.meter.denominator
            for (let offset = 0; offset < duration; offset += beatTicks) {
              schedule(track.instrument, slot.chord, at + offset * secondsPerTick, Math.min(beatTicks * secondsPerTick * 0.7, length), track.volume)
            }
          } else {
            schedule(track.instrument, slot.chord, at, length, track.volume)
          }
        }
        tick += duration
      }
      for (const track of enabledTracks.filter((item) => item.instrument === 'drums')) {
        const beatTicks = 16 / progression.meter.denominator
        for (let beat = 0; beat < progression.meter.numerator; beat += 1) {
          const at = barStart + beat * beatTicks * secondsPerTick
          addNote(9, beat % 2 === 0 ? 36 : 38, at, 0.12, track.volume)
          addNote(9, 42, at + 0.01, 0.045, track.volume * 0.38)
        }
      }
      cursor += barTicks * secondsPerTick
    }
  }

  for (const [channel, program] of channels) synth.programChange(channel, program, { time: context.currentTime })
  events.sort((a, b) => a.at - b.at || Number(a.on) - Number(b.on))
  let eventIndex = 0
  let timer = 0
  let stopped = false
  const finish = () => {
    if (stopped) return
    stopped = true
    window.clearInterval(timer)
    synth.stopAll(true)
    onEnded()
  }
  const scheduleAhead = () => {
    const horizon = context.currentTime + 0.1
    while (eventIndex < events.length && events[eventIndex]!.at <= horizon) {
      const event = events[eventIndex++]!
      if (event.on) synth.noteOn(event.channel, event.note, event.velocity, { time: event.at })
      else synth.noteOff(event.channel, event.note, { time: event.at })
    }
    if (eventIndex >= events.length) {
      window.clearInterval(timer)
      timer = window.setTimeout(finish, Math.max(100, (cursor - context.currentTime) * 1000)) as unknown as number
    }
  }
  timer = window.setInterval(scheduleAhead, 25)
  scheduleAhead()
  return finish
}
