/**
 * T-FX-01 tuner pitch math (ADR-0037).
 *
 * Pure functions only — no mic, no DOM, no AudioContext. The tuner reports
 * the heard pitch; it never scores takes (no reference melody exists).
 */

/** Below this RMS the input counts as silence (mic open, nothing heard). */
export const TUNER_SILENCE_RMS = 0.01
/** Lowest frequency the tuner reports (A1 ≈ 55 Hz). */
export const TUNER_MIN_HZ = 55
/** Highest frequency the tuner reports. */
export const TUNER_MAX_HZ = 2000
/** Analysis window in samples (power of two, ~46 ms at 48 kHz). */
export const TUNER_FRAME_SIZE = 2048
/** YIN absolute threshold for the first-dip decision. */
const YIN_THRESHOLD = 0.1

export function computeRms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] ?? 0
    sum += v * v
  }
  return Math.sqrt(sum / samples.length)
}

function parabolicInterpolation(y0: number, y1: number, y2: number): number {
  const denom = y0 - 2 * y1 + y2
  if (denom === 0) return 0
  return (0.5 * (y0 - y2)) / denom
}

/**
 * YIN fundamental-frequency estimate (difference function + cumulative-mean
 * normalization + parabolic interpolation). Returns Hz, or null for
 * silence / out-of-range / unvoiced frames. Hand-rolled: no dependencies.
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
): number | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return null
  if (samples.length < TUNER_FRAME_SIZE) return null
  const frame = samples.subarray(0, TUNER_FRAME_SIZE)
  if (computeRms(frame) < TUNER_SILENCE_RMS) return null

  const minPeriod = Math.max(2, Math.floor(sampleRate / TUNER_MAX_HZ))
  const maxPeriod = Math.min(
    Math.floor(TUNER_FRAME_SIZE / 2),
    Math.ceil(sampleRate / TUNER_MIN_HZ),
  )
  if (maxPeriod <= minPeriod) return null

  // Step 2–3: difference function + cumulative mean normalized difference.
  let runningSum = 0
  const cmnd = new Float32Array(maxPeriod + 1)
  cmnd[0] = 1
  let tau = -1
  for (let period = 1; period <= maxPeriod; period++) {
    let diff = 0
    for (let i = 0; i + period < TUNER_FRAME_SIZE; i++) {
      const d = frame[i]! - frame[i + period]!
      diff += d * d
    }
    runningSum += diff
    cmnd[period] = runningSum === 0 ? 1 : (diff * period) / runningSum
  }
  for (let period = minPeriod; period <= maxPeriod; period++) {
    if (cmnd[period]! < YIN_THRESHOLD) {
      // Step 4: first dip below threshold — refine to the local minimum.
      let best = period
      while (best + 1 <= maxPeriod && cmnd[best + 1]! < cmnd[best]!) best++
      tau = best
      break
    }
  }
  if (tau < 0) return null

  // Step 5: parabolic interpolation around the dip.
  let refined = tau
  if (tau > 0 && tau < maxPeriod) {
    refined = tau + parabolicInterpolation(cmnd[tau - 1]!, cmnd[tau]!, cmnd[tau + 1]!)
  }
  if (!(refined > 0)) return null
  const hz = sampleRate / refined
  if (!Number.isFinite(hz) || hz < TUNER_MIN_HZ || hz > TUNER_MAX_HZ) return null
  return hz
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export type TunerNote = {
  /** Chromatic name (C..B, `#` for sharps). */
  name: string
  /** Scientific-pitch octave (A4 = 440 Hz reference). */
  octave: number
  /** Signed cents away from the nearest semitone (−50..+50). */
  cents: number
  /** MIDI note number of the nearest semitone. */
  midi: number
  /** e.g. "A4". */
  display: string
}

/** Nearest chromatic note for a detected frequency (A4 = 440 Hz). */
export function frequencyToNote(freqHz: number): TunerNote | null {
  if (!Number.isFinite(freqHz) || freqHz <= 0) return null
  const midiFloat = 69 + 12 * Math.log2(freqHz / 440)
  const midi = Math.round(midiFloat)
  if (midi < 0 || midi > 127) return null
  const name = NOTE_NAMES[((midi % 12) + 12) % 12]!
  const octave = Math.floor(midi / 12) - 1
  const cents = Math.round((midiFloat - midi) * 100)
  return { name, octave, cents, midi, display: `${name}${octave}` }
}
