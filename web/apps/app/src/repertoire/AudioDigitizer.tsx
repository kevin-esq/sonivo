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
import { useT } from '../i18n'
import {
  formatTimestamp,
  isDigitizableResource,
  segmentsToLyricsDraft,
  suggestLineMapping,
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
 * ADR-0032 T-W32-02: Owner-only audio digitizer review surface.
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
  const { t } = useT()
  const [job, setJob] = useState<JobView>({ phase: 'idle' })
  const [lineFor, setLineFor] = useState<number[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const pollTimer = useRef<number | null>(null)
  // Single select (not one row per resource) so resource labels stay unique
  // on the page for assistive tech and the shared E2E resource helpers.
  const selectedResourceId =
    eligible.some((r) => r.id === selectedId) ? selectedId! : (eligible[0]?.id ?? null)

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
        message: current.error ?? t('practica.digitize.failed'),
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
      setSuccess(t('practica.digitize.marksApplied'))
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
      setSuccess(t('practica.digitize.lyricsAdded'))
      await onChanged()
    } catch (err) {
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  function handleSuggestMapping() {
    if (job.phase !== 'ready') return
    setLineFor(suggestLineMapping(arrangement.chords, job.segments.length))
  }

  const workingResourceLabel =
    job.phase === 'working' || job.phase === 'ready' || job.phase === 'failed'
      ? (eligible.find((r) => r.id === job.resourceId)?.label ?? '')
      : ''

  return (
    <section
      className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-4"
      aria-labelledby="digitize-heading"
      data-testid="audio-digitizer"
    >
      <h3 id="digitize-heading" className="font-semibold">
        {t('practica.digitize.title')}
      </h3>
      <p className="text-sm text-muted">
        {t('practica.digitize.subtitle')}
      </p>

      {job.phase === 'idle' ? (
        <div className="space-y-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{t('practica.digitize.audioLabel')}</span>
            <select
              className={fieldClass}
              value={selectedResourceId ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              data-testid="digitize-resource-select"
            >
              {eligible.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            size="sm"
            disabled={selectedResourceId == null}
            onClick={() => {
              if (selectedResourceId != null) void handleStart(selectedResourceId)
            }}
            data-testid="digitize-start"
          >
            {t('practica.digitize.start')}
          </Button>
        </div>
      ) : null}

      {job.phase === 'working' ? (
        <p
          className="text-sm text-muted"
          role="status"
          aria-live="polite"
          data-testid="digitize-status"
        >
          {job.jobId === ''
            ? t('practica.digitize.starting')
            : t('practica.digitize.working')}{' '}
          {workingResourceLabel ? `(${workingResourceLabel})` : null}
        </p>
      ) : null}

      {job.phase === 'failed' ? (
        <div className="space-y-2" data-testid="digitize-status">
          <ProblemAlert message={job.message} />
          <Button variant="secondary" size="sm" onClick={handleDiscard} data-testid="digitize-discard">
            {t('practica.digitize.discard')}
          </Button>
        </div>
      ) : null}

      {job.phase === 'ready' ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">{t('practica.digitize.review')}</h4>
          {job.segments.length === 0 ? (
            <p className="text-sm text-muted" data-testid="digitize-segments">
              {t('practica.digitize.noVoice')}
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto" data-testid="digitize-segments">
              {job.segments.map((segment, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-hover p-2 ring-1 ring-border-subtle"
                >
                  <span className="font-mono text-xs text-muted">
                    {formatTimestamp(segment.startMs)} → {formatTimestamp(segment.endMs)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">{segment.text}</span>
                  <label className="flex items-center gap-1 text-xs text-muted">
                    {t('practica.digitize.line')}
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
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={handleSuggestMapping}
                data-testid="digitize-suggest"
              >
                {t('practica.digitize.suggest')}
              </Button>
            ) : null}
            {job.segments.length > 0 ? (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => void handleApplyMarks()}
                data-testid="digitize-apply-marks"
              >
                {pending ? t('practica.digitize.applying') : t('practica.digitize.applyMarks')}
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
                {pending ? t('practica.digitize.adding') : t('practica.digitize.appendLyrics')}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={handleDiscard}
              data-testid="digitize-discard"
            >
              {t('practica.digitize.discard')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
