import { useEffect, useRef, useState } from 'react'
import {
  getDigitizeJob,
  startDigitizeJob,
  updateArrangement,
  type ArrangementDetail,
  type DigitizeJob,
  type DigitizeSegment,
} from '../api/client'
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'
import {
  formatTimestamp,
  isDigitizableResource,
  segmentsToLyricsDraft,
} from './digitize'
import {
  parseChordTimingJson,
  serializeChordTimingJson,
  upsertChordTimingMark,
} from './chordTiming'
import { mutationErrorMessage, ProblemAlert } from './ui'

type JobView =
  | { phase: 'idle' }
  | { phase: 'working'; resourceId: string; jobId: string; status: string; error: null }
  | { phase: 'ready'; resourceId: string; jobId: string; segments: DigitizeSegment[] }
  | { phase: 'failed'; resourceId: string; message: string }

const POLL_MS = 1500

/**
 * ADR-0032 T-W32-02: Owner-only audio digitizer review surface (Spanish).
 * Drafts live in component state only — nothing persists until the Owner
 * explicitly applies via the existing Arrangement PATCH paths. Members never
 * see drafts (the parent renders this only for Owners).
 */
export function AudioDigitizer({
  groupId,
  arrangement,
  onChanged,
}: {
  groupId: string
  arrangement: ArrangementDetail
  onChanged: () => Promise<void>
}) {
  const eligible = arrangement.resources.filter(isDigitizableResource)
  const [job, setJob] = useState<JobView>({ phase: 'idle' })
  const [lineFor, setLineFor] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const pollTimer = useRef<number | null>(null)

  function stopPolling() {
    if (pollTimer.current != null) {
      window.clearTimeout(pollTimer.current)
      pollTimer.current = null
    }
  }

  useEffect(() => stopPolling, [])

  // Reset the draft when navigating to a different arrangement via remount key.
  // (A version bump after apply/append keeps the draft + success message visible.)

  if (eligible.length === 0) return null

  async function pollStatus(resourceId: string, jobId: string): Promise<void> {
    let current: DigitizeJob
    try {
      current = await getDigitizeJob(groupId, arrangement.id, jobId)
    } catch (err) {
      setJob({ phase: 'failed', resourceId, message: mutationErrorMessage(err) })
      return
    }

    if (current.status === 'done') {
      setJob({ phase: 'ready', resourceId, jobId, segments: current.segments ?? [] })
      setLineFor((current.segments ?? []).map((_, i) => i))
      return
    }

    if (current.status === 'failed') {
      setJob({
        phase: 'failed',
        resourceId,
        message: current.error ?? 'No se pudo digitalizar el audio.',
      })
      return
    }

    setJob({ phase: 'working', resourceId, jobId, status: current.status, error: null })
    pollTimer.current = window.setTimeout(() => void pollStatus(resourceId, jobId), POLL_MS)
  }

  async function handleStart(resourceId: string) {
    stopPolling()
    setError(null)
    setSuccess(null)
    setJob({ phase: 'working', resourceId, jobId: '', status: 'queued', error: null })
    try {
      const started = await startDigitizeJob(groupId, arrangement.id, resourceId)
      await pollStatus(resourceId, started.jobId)
    } catch (err) {
      setJob({
        phase: 'failed',
        resourceId,
        message: mutationErrorMessage(err),
      })
    }
  }

  function handleDiscard() {
    stopPolling()
    setJob({ phase: 'idle' })
    setLineFor([])
    setError(null)
    setSuccess(null)
  }

  async function handleApplyMarks() {
    if (job.phase !== 'ready') return
    setPending(true)
    setError(null)
    setSuccess(null)
    try {
      const existing = parseChordTimingJson(arrangement.chordTimingJson)
      let merged = existing
      job.segments.forEach((segment, i) => {
        merged = upsertChordTimingMark(merged, lineFor[i] ?? i, segment.startMs)
      })
      await updateArrangement(groupId, arrangement.id, {
        expectedVersion: arrangement.version,
        chordTimingJson: serializeChordTimingJson(merged),
      })
      setSuccess('Marcas aplicadas. Puedes revisarlas en Practicar con «Seguir letra».')
      await onChanged()
    } catch (err) {
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  async function handleAppendLyrics() {
    if (job.phase !== 'ready') return
    setPending(true)
    setError(null)
    setSuccess(null)
    try {
      const draft = segmentsToLyricsDraft(job.segments)
      const current = arrangement.lyrics?.trim() ?? ''
      const next = current ? `${current}\n${draft}` : draft
      await updateArrangement(groupId, arrangement.id, {
        expectedVersion: arrangement.version,
        lyrics: next,
      })
      setSuccess('Letra añadida al arreglo.')
      await onChanged()
    } catch (err) {
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  const workingResourceLabel =
    job.phase === 'working' || job.phase === 'ready' || job.phase === 'failed'
      ? (eligible.find((r) => r.id === job.resourceId)?.label ?? '')
      : ''

  return (
    <section
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
      aria-labelledby="digitize-heading"
      data-testid="audio-digitizer"
    >
      <h3 id="digitize-heading" className="font-semibold">
        Digitalizar audio
      </h3>
      <p className="text-sm text-slate-500">
        Convierte un audio en un borrador de marcas de tiempo y letra. Nada se guarda hasta que lo
        revises y lo apliques.
      </p>

      {job.phase === 'idle' ? (
        <ul className="space-y-2">
          {eligible.map((resource) => (
            <li key={resource.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-sm font-medium text-neutral-dark">
                {resource.label}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleStart(resource.id)}
                data-testid="digitize-start"
              >
                Digitalizar audio
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {job.phase === 'working' ? (
        <p
          className="text-sm text-slate-600"
          role="status"
          aria-live="polite"
          data-testid="digitize-status"
        >
          {job.jobId === ''
            ? 'Iniciando digitalización…'
            : 'Digitalizando… Esto puede tardar unos segundos.'}{' '}
          {workingResourceLabel ? `(${workingResourceLabel})` : null}
        </p>
      ) : null}

      {job.phase === 'failed' ? (
        <div className="space-y-2" data-testid="digitize-status">
          <ProblemAlert message={job.message} />
          <Button variant="secondary" size="sm" onClick={handleDiscard} data-testid="digitize-discard">
            Descartar
          </Button>
        </div>
      ) : null}

      {job.phase === 'ready' ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Revisar borrador</h4>
          {job.segments.length === 0 ? (
            <p className="text-sm text-slate-500" data-testid="digitize-segments">
              No se detectó voz en el audio.
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto" data-testid="digitize-segments">
              {job.segments.map((segment, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-neutral-light p-2 ring-1 ring-slate-200"
                >
                  <span className="font-mono text-xs text-slate-500">
                    {formatTimestamp(segment.startMs)} → {formatTimestamp(segment.endMs)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">{segment.text}</span>
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    Línea
                    <input
                      className={`${fieldClass} w-20`}
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={lineFor[i] ?? i}
                      onChange={(e) => {
                        const parsed = Number(e.target.value)
                        if (!Number.isInteger(parsed) || parsed < 0) return
                        setLineFor((prev) => {
                          const next = [...prev]
                          next[i] = parsed
                          return next
                        })
                      }}
                      data-testid={`digitize-segment-${i}-line`}
                    />
                  </label>
                </li>
              ))}
            </ul>
          )}
          <ProblemAlert message={error} />
          {success ? (
            <p
              className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              role="status"
              data-testid="digitize-success"
            >
              {success}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {job.segments.length > 0 ? (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => void handleApplyMarks()}
                data-testid="digitize-apply-marks"
              >
                {pending ? 'Aplicando…' : 'Aplicar marcas'}
              </Button>
            ) : null}
            {job.segments.length > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => void handleAppendLyrics()}
                data-testid="digitize-append-lyrics"
              >
                {pending ? 'Añadiendo…' : 'Añadir a letra'}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={handleDiscard}
              data-testid="digitize-discard"
            >
              Descartar
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
