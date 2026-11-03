import { useEffect, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'
import { useT, type I18nKey } from '../i18n'
import {
  TUNER_FRAME_SIZE,
  computeRms,
  detectPitch,
  frequencyToNote,
  TUNER_SILENCE_RMS,
  type TunerNote,
} from './tunerPitch'
import { TUNER_WORKLET_NAME, TUNER_WORKLET_SOURCE } from './tunerWorklet'

/**
 * T-FX-01 chromatic tuner (ADR-0037).
 *
 * Client-only: mic via getUserMedia on explicit user gesture, pitch via
 * hand-rolled YIN in an AudioWorklet capture path (AnalyserNode fallback),
 * no recording, no persistence, no server. Reports the heard pitch only —
 * never scores (no reference melody exists in Sonivo).
 */

type TunerStatus = 'closed' | 'requesting' | 'active' | 'denied' | 'error'
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const REFERENCE_NOTES = Array.from({ length: 45 }, (_, index) => {
  const midi = index + 40
  return { midi, label: `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}` }
})

function centsLabel(
  cents: number,
  t: (key: I18nKey, params?: Record<string, string | number>) => string,
): string {
  if (Math.abs(cents) <= 5) return t('practice.tuner.inTune')
  return cents > 0
    ? t('practice.tuner.sharp', { cents })
    : t('practice.tuner.flat', { cents })
}

export function TunerPanel() {
  const { t } = useT()
  const [status, setStatus] = useState<TunerStatus>('closed')
  const [note, setNote] = useState<TunerNote | null>(null)
  const [freqHz, setFreqHz] = useState<number | null>(null)
  const [targetMidi, setTargetMidi] = useState(69)
  const [hearingSound, setHearingSound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [referenceError, setReferenceError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const nodesRef = useRef<{ disconnect: () => void } | null>(null)
  const rafRef = useRef<number | null>(null)
  const bufferRef = useRef<Float32Array>(new Float32Array(0))
  const smoothedFrequencyRef = useRef<number | null>(null)
  const referenceToneRef = useRef<{ context: AudioContext; oscillator: OscillatorNode } | null>(null)
  const statusRef = useRef<TunerStatus>('closed')
  statusRef.current = status

  function stopAudio() {
    stopReferenceTone()
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    try {
      nodesRef.current?.disconnect()
    } catch {
      /* best effort */
    }
    nodesRef.current = null
    for (const track of streamRef.current?.getTracks() ?? []) {
      try {
        track.stop()
      } catch {
        /* best effort */
      }
    }
    streamRef.current = null
    if (contextRef.current) {
      const ctx = contextRef.current
      contextRef.current = null
      void ctx.close().catch(() => undefined)
    }
    bufferRef.current = new Float32Array(0)
  }

  function stopReferenceTone() {
    const tone = referenceToneRef.current
    referenceToneRef.current = null
    if (!tone) return
    try {
      tone.oscillator.stop()
    } catch {
      /* already stopped */
    }
    void tone.context.close().catch(() => undefined)
  }

  useEffect(() => {
    return () => {
      stopAudio()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pushSamples(chunk: ArrayLike<number>) {
    const prev = bufferRef.current
    const next = new Float32Array(prev.length + chunk.length)
    next.set(prev, 0)
    for (let i = 0; i < chunk.length; i++) next[prev.length + i] = chunk[i] ?? 0
    // Keep only the latest 2 frames — buffers are analysed and dropped.
    const maxKeep = TUNER_FRAME_SIZE * 2
    bufferRef.current = next.length > maxKeep ? next.subarray(next.length - maxKeep) : next
  }

  function startAnalysisLoop(
    readFrame: () => Float32Array | null,
    sampleRate: number,
  ) {
    let lastUpdate = 0
    const tick = (now: number) => {
      if (statusRef.current !== 'active') return
      if (now - lastUpdate >= 120) {
        lastUpdate = now
        const frame = readFrame()
        if (frame) {
          const rms = computeRms(frame)
          setHearingSound(rms >= TUNER_SILENCE_RMS)
          const detectedHz = detectPitch(frame, sampleRate)
          const previousHz = smoothedFrequencyRef.current
          const jumpInCents = previousHz == null || detectedHz == null
            ? Infinity
            : Math.abs(1200 * Math.log2(detectedHz / previousHz))
          const hz = detectedHz == null
            ? null
            : previousHz != null && jumpInCents < 100
              ? previousHz * 0.7 + detectedHz * 0.3
              : detectedHz
          smoothedFrequencyRef.current = hz
          setFreqHz(hz)
          setNote(hz == null ? null : frequencyToNote(hz))
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  async function openTuner() {
    setError(null)
    setNote(null)
    setFreqHz(null)
    smoothedFrequencyRef.current = null
    setHearingSound(false)
    setStatus('requesting')

    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.getUserMedia) {
      setError(t('practice.tuner.browserUnsupported'))
      setStatus('error')
      return
    }

    let stream: MediaStream
    try {
      stream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
    } catch (err) {
      stopAudio()
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError(
          t('practice.tuner.denied'),
        )
        setStatus('denied')
      } else {
        setError(t('practice.tuner.openFailed'))
        setStatus('error')
      }
      return
    }

    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) throw new Error('no-audio-context')
      const ctx = new Ctor()
      contextRef.current = ctx
      streamRef.current = stream
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => undefined)
      }
      const source = ctx.createMediaStreamSource(stream)

      // Primary path: AudioWorklet capture (ScriptProcessorNode is deprecated).
      let workletReady = false
      const worklets = ctx.audioWorklet
      if (worklets) {
        try {
          const blob = new Blob([TUNER_WORKLET_SOURCE], { type: 'application/javascript' })
          const url = URL.createObjectURL(blob)
          try {
            await worklets.addModule(url)
            const node = new AudioWorkletNode(ctx, TUNER_WORKLET_NAME)
            node.port.onmessage = (event: MessageEvent<Float32Array>) => {
              pushSamples(event.data)
            }
            source.connect(node)
            nodesRef.current = {
              disconnect: () => {
                try {
                  source.disconnect(node)
                } catch {
                  /* best effort */
                }
                try {
                  node.disconnect()
                } catch {
                  /* best effort */
                }
                try {
                  node.port.close()
                } catch {
                  /* best effort */
                }
              },
            }
            workletReady = true
          } finally {
            URL.revokeObjectURL(url)
          }
        } catch {
          workletReady = false
        }
      }

      if (workletReady) {
        setStatus('active')
        startAnalysisLoop(() => {
          const buf = bufferRef.current
          if (buf.length < TUNER_FRAME_SIZE) return null
          return buf.subarray(buf.length - TUNER_FRAME_SIZE)
        }, ctx.sampleRate)
      } else {
        // Fallback: AnalyserNode time-domain data (no deprecated APIs).
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 4096
        source.connect(analyser)
        nodesRef.current = {
          disconnect: () => {
            try {
              source.disconnect(analyser)
            } catch {
              /* best effort */
            }
          },
        }
        const scratch = new Float32Array(analyser.fftSize)
        setStatus('active')
        startAnalysisLoop(() => {
          analyser.getFloatTimeDomainData(scratch)
          return scratch.slice(0, TUNER_FRAME_SIZE)
        }, ctx.sampleRate)
      }
    } catch {
      stopAudio()
      setError(t('practice.tuner.startFailed'))
      setStatus('error')
    }
  }

  function closeTuner() {
    stopAudio()
    setStatus('closed')
    setNote(null)
    setFreqHz(null)
    smoothedFrequencyRef.current = null
    setHearingSound(false)
    setError(null)
  }

  async function playReferenceTone() {
    setReferenceError(null)
    stopReferenceTone()
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) {
      setReferenceError(t('practice.tuner.referenceFailed'))
      return
    }
    let contextToClose: AudioContext | null = null
    try {
      const context = new Ctor()
      contextToClose = context
      if (context.state === 'suspended') await context.resume()
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const now = context.currentTime
      oscillator.type = 'sine'
      oscillator.frequency.value = 440 * 2 ** ((targetMidi - 69) / 12)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75)
      oscillator.connect(gain).connect(context.destination)
      oscillator.onended = () => {
        if (referenceToneRef.current?.oscillator === oscillator) referenceToneRef.current = null
        void context.close().catch(() => undefined)
      }
      referenceToneRef.current = { context, oscillator }
      oscillator.start(now)
      oscillator.stop(now + 0.76)
    } catch {
      if (contextToClose) void contextToClose.close().catch(() => undefined)
      setReferenceError(t('practice.tuner.referenceFailed'))
    }
  }

  const open = status === 'requesting' || status === 'active'
  const targetCents = freqHz == null ? null : Math.round(1200 * Math.log2(freqHz / (440 * 2 ** ((targetMidi - 69) / 12))))
  const targetNote = REFERENCE_NOTES.find((item) => item.midi === targetMidi)?.label ?? 'A4'

  return (
    <div className="space-y-3" data-testid="tuner-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={open ? 'secondary' : 'primary'}
          size="sm"
          data-testid="tuner-toggle"
          aria-expanded={open}
          onClick={() => {
            if (open) closeTuner()
            else void openTuner()
          }}
        >
          {open ? t('common.close') : t('practice.tuner.open')}
        </Button>
        {status === 'requesting' ? (
          <p className="text-sm text-muted">{t('practice.tuner.requesting')}</p>
        ) : null}
      </div>

      <p className="text-xs text-muted" data-testid="tuner-hint">
        {t('practice.tuner.hint')}
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm font-medium text-ink" htmlFor="tuner-reference-note">
          <span className="block">{t('practice.tuner.targetNote')}</span>
          <select id="tuner-reference-note" className={fieldClass} value={targetMidi} onChange={(event) => setTargetMidi(Number(event.target.value))}>
            {REFERENCE_NOTES.map((item) => <option key={item.midi} value={item.midi}>{item.label}</option>)}
          </select>
        </label>
        <Button variant="secondary" size="sm" onClick={() => void playReferenceTone()}>
          <Volume2 className="mr-2 h-4 w-4" aria-hidden="true" />{t('practice.tuner.playReference')}
        </Button>
      </div>
      {referenceError ? <p role="alert" className="text-sm text-error-ink">{referenceError}</p> : null}

      {open || status === 'denied' || status === 'error' ? (
        <div
          className="space-y-2 rounded-xl border border-border-subtle bg-surface-hover p-4"
          aria-live="polite"
        >
          {(status === 'denied' || status === 'error') && error ? (
            <p className="text-sm font-medium text-red-700" data-testid="tuner-error">
              {error}
            </p>
          ) : null}

          {status === 'active' ? (
            <div className="space-y-1">
              <p className="text-4xl font-bold tracking-tight text-ink" data-testid="tuner-note">
                {note ? note.display : '—'}
              </p>
              <p className="text-sm text-muted" data-testid="tuner-hz">
                {freqHz != null ? `${freqHz.toFixed(1)} Hz` : t('practice.tuner.listening')}
              </p>
              <p className="text-sm text-muted">{t('practice.tuner.reference', { note: targetNote })}</p>
              <p className="text-sm text-muted" data-testid="tuner-cents">
                {note && targetCents != null
                  ? centsLabel(targetCents, t)
                  : hearingSound
                    ? t('practice.tuner.noClearPitch')
                    : t('practice.tuner.silence')}
              </p>
              <div
                className="relative h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-hover"
                role="img"
                aria-label={
                  note && targetCents != null
                    ? t('practice.tuner.deviation', { value: centsLabel(targetCents, t) })
                    : t('practice.tuner.noReading')
                }
              >
                <div
                  className="absolute left-1/2 top-0 h-full w-0.5 bg-slate-400"
                  aria-hidden="true"
                />
                {note && targetCents != null ? (
                  <div
                    className="absolute top-0 h-full w-2 rounded-full bg-primary"
                    style={{ left: `calc(${50 + Math.max(-50, Math.min(50, targetCents))}% - 4px)` }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
