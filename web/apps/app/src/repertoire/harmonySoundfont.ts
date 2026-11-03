import type { WorkletSynthesizer } from './vendor/spessasynth'

type AudioEngine = { context: AudioContext; synth: WorkletSynthesizer }
let enginePromise: Promise<AudioEngine> | null = null

async function loadEngine(): Promise<AudioEngine> {
  const context = new AudioContext({ latencyHint: 'interactive' })
  try {
    await context.resume()
    await context.audioWorklet.addModule('/audio/harmony/spessasynth_processor.min.js')
    const { WorkletSynthesizer } = await import('./vendor/spessasynth.js')
    const synth = new WorkletSynthesizer(context)
    await synth.isReady
    const soundfont = await fetch('/audio/harmony/MuseScore_General.sf3')
    if (!soundfont.ok) throw new Error(`SoundFont request failed: ${soundfont.status}`)
    await synth.soundBankManager.addSoundBank(await soundfont.arrayBuffer(), 'MuseScore-General')
    synth.connect(context.destination)
    return { context, synth }
  } catch (error) {
    await context.close()
    throw error
  }
}

export function getHarmonyAudioEngine(): Promise<AudioEngine> {
  if (!enginePromise) {
    enginePromise = loadEngine().catch((error) => {
      enginePromise = null
      throw error
    })
  }
  return enginePromise
}

export async function playMidiNote(midiNote: number, channel = 15, durationSeconds = 0.75) {
  const { context, synth } = await getHarmonyAudioEngine()
  await context.resume()
  const start = context.currentTime + 0.015
  synth.programChange(channel, 0, { time: start })
  synth.noteOn(channel, midiNote, 92, { time: start })
  synth.noteOff(channel, midiNote, { time: start + durationSeconds })
}
