import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/button'
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

function centsLabel(cents: number): string {
  if (cents === 0) return 'afinada'
  return cents > 0 ? `+${cents} cents (alta)` : `${cents} cents (baja)`
}

export function TunerPanel() {
  const [status, setStatus] = useState<TunerStatus>('closed')
  const [note, setNote] = useState<TunerNote | null>(null)
  const [freqHz, setFreqHz] = useState<number | null>(null)
  const [hearingSound, setHearingSound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const nodesRef = useRef<{ disconnect: () => void } | null>(null)
  const rafRef = useRef<number | null>(null)
  const bufferRef = useRef<Float32Array>(new Float32Array(0))
  const statusRef = useRef<TunerStatus>('closed')
  statusRef.current = status

  function stopAudio() {
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
          const hz = detectPitch(frame, sampleRate)
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
    setHearingSound(false)
    setStatus('requesting')

    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.getUserMedia) {
      setError('Este navegador no permite acceder al micrófono. Prueba con otro navegador.')
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
          'No se pudo acceder al micrófono. Revisa los permisos del navegador para poder afinar.',
        )
        setStatus('denied')
      } else {
        setError('No se pudo abrir el micrófono. Inténtalo de nuevo.')
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
      setError('No se pudo iniciar el afinador. Inténtalo de nuevo.')
      setStatus('error')
    }
  }

  function closeTuner() {
    stopAudio()
    setStatus('closed')
    setNote(null)
    setFreqHz(null)
    setHearingSound(false)
    setError(null)
  }

  const open = status === 'requesting' || status === 'active'

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
          {open ? 'Cerrar' : 'Abrir afinador'}
        </Button>
        {status === 'requesting' ? (
          <p className="text-sm text-slate-600">Pidiendo acceso al micrófono…</p>
        ) : null}
      </div>

      <p className="text-xs text-slate-500" data-testid="tuner-hint">
        El micrófono solo se activa al abrir el afinador y se apaga al cerrarlo. Nada se
        graba ni se guarda. Requiere HTTPS o localhost.
      </p>

      {open || status === 'denied' || status === 'error' ? (
        <div
          className="space-y-2 rounded-xl border border-slate-200 bg-neutral-light p-4"
          aria-live="polite"
        >
          {(status === 'denied' || status === 'error') && error ? (
            <p className="text-sm font-medium text-red-700" data-testid="tuner-error">
              {error}
            </p>
          ) : null}

          {status === 'active' ? (
            <div className="space-y-1">
              <p className="text-4xl font-bold tracking-tight text-neutral-dark" data-testid="tuner-note">
                {note ? note.display : '—'}
              </p>
              <p className="text-sm text-slate-600" data-testid="tuner-hz">
                {freqHz != null ? `${freqHz.toFixed(1)} Hz` : 'Escuchando…'}
              </p>
              <p className="text-sm text-slate-600" data-testid="tuner-cents">
                {note ? centsLabel(note.cents) : hearingSound ? 'Sin tono claro' : 'Silencio'}
              </p>
              <div
                className="relative h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-200"
                role="img"
                aria-label={
                  note ? `Desviación: ${centsLabel(note.cents)}` : 'Sin lectura de afinación'
                }
              >
                <div
                  className="absolute left-1/2 top-0 h-full w-0.5 bg-slate-400"
                  aria-hidden="true"
                />
                {note ? (
                  <div
                    className="absolute top-0 h-full w-2 rounded-full bg-primary"
                    style={{ left: `calc(${50 + note.cents}% - 4px)` }}
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
