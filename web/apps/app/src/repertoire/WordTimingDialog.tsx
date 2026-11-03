import { useEffect, useRef, useState } from 'react'
import { AudioLines, Play, Trash2 } from 'lucide-react'
import { GroupDialog } from '../groups/ui'
import { Button } from '../ui/button'
import { useT } from '../i18n'
import { formatChordTimestamp, parseChordTimestamp } from './chordTiming'
import { useAudioPlayer } from './AudioPlayerContext'

// shortcut: illustrative waveform until media service exposes peaks; avoid downloading full tracks to draw it.
const WAVEFORM = [18, 27, 41, 30, 55, 37, 68, 45, 31, 52, 76, 39, 24, 43, 62, 35, 49, 81, 56, 34, 45, 66, 39, 27, 52, 72, 43, 30, 61, 38, 80, 48, 34, 57, 73, 41, 27, 47, 64, 35, 55, 84, 49, 32, 60, 39, 70, 45, 28, 52, 74, 40, 31, 59, 37, 68, 46, 26, 50, 78, 43, 33, 62, 38, 54, 72, 42, 29, 58, 36, 67, 45]

export function WordTimingDialog({
  open,
  onClose,
  word,
  startMs,
  endMs,
  durationMs,
  currentMs,
  onSave,
  onNudge,
  onRemove,
  onListen,
}: {
  open: boolean
  onClose: () => void
  word: string
  startMs: number
  endMs: number
  durationMs: number
  currentMs: number
  onSave: (startMs: number, endMs: number, word: string) => boolean
  onNudge: (deltaMs: number) => void
  onRemove: () => void
  onListen: (startMs: number) => void
}) {
  const { t } = useT()
  const { playbackRate, setPlaybackRate } = useAudioPlayer()
  const previousRate = useRef(playbackRate)
  const playbackRateRef = useRef(playbackRate)
  playbackRateRef.current = playbackRate
  const [startDraft, setStartDraft] = useState(formatChordTimestamp(startMs))
  const [endDraft, setEndDraft] = useState(formatChordTimestamp(endMs))
  const [wordDraft, setWordDraft] = useState(word)
  const [error, setError] = useState<string | null>(null)
  const dragHandle = useRef<'start' | 'end' | null>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const parsedStart = parseChordTimestamp(startDraft)
  const parsedEnd = parseChordTimestamp(endDraft)
  const rulerDuration = Math.max(durationMs, endMs, 1)
  const rangeStart = Math.max(0, Math.min(rulerDuration, parsedStart ?? startMs))
  const rangeEnd = Math.max(rangeStart, Math.min(rulerDuration, parsedEnd ?? endMs))
  const currentPosition = Math.max(0, Math.min(rulerDuration, currentMs))
  const dirty = parsedStart !== startMs || parsedEnd !== endMs

  useEffect(() => {
    if (!open) return
    setStartDraft(formatChordTimestamp(startMs))
    setEndDraft(formatChordTimestamp(endMs))
    setWordDraft(word)
    setError(null)
  }, [open, startMs, endMs, word])

  useEffect(() => {
    if (open) previousRate.current = playbackRateRef.current
  }, [open])

  function close() {
    setPlaybackRate(previousRate.current)
    onClose()
  }

  function updateHandle(handle: 'start' | 'end', clientX: number) {
    const bounds = rulerRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width === 0) return
    const next = Math.round(Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)) * rulerDuration)
    if (handle === 'start') {
      setStartDraft(formatChordTimestamp(Math.max(0, Math.min(next, rangeEnd - 1))))
    } else {
      setEndDraft(formatChordTimestamp(Math.min(rulerDuration, Math.max(next, rangeStart + 1))))
    }
    setError(null)
  }

  function save() {
    const nextWord = wordDraft.trim()
    if (parsedStart == null || parsedEnd == null) { setError(t('times.invalidTimestamp')); return }
    if (parsedEnd <= parsedStart) { setError(t('times.wordTimingInvalid')); return }
    if (!nextWord || /\s/.test(nextWord)) { setError(t('times.wordMustBeSingleToken')); return }
    if (!onSave(parsedStart, parsedEnd, nextWord)) { setError(t('times.wordTimingConflict')); return }
    close()
  }

  return (
    <GroupDialog
      open={open}
      onClose={close}
      title={t('times.wordTimingTitle', { word })}
      size="sm"
      fitContent
      testId="word-timing-dialog"
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <Button type="button" variant="danger" size="sm" onClick={() => { onRemove(); close() }}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />{t('times.clearWord', { word })}
          </Button>
          <Button type="button" onClick={save}>
            {t('times.saveWordTiming')}
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary"
            value={wordDraft}
            onChange={(event) => { setWordDraft(event.target.value); setError(null) }}
            aria-label={t('times.editWord')}
            data-autofocus
            data-testid="word-timing-text-input"
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => parsedStart != null && onListen(parsedStart)} disabled={parsedStart == null} aria-label={t('times.listenFromWord')}>
            <Play className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="space-y-3 rounded-xl border border-border-subtle bg-surface-hover p-3">
          <div
            ref={rulerRef}
            className="relative flex h-16 touch-none items-center gap-[2px] overflow-hidden rounded-lg bg-surface px-3"
            data-testid="word-timing-ruler"
            onPointerMove={(event) => { if (dragHandle.current) updateHandle(dragHandle.current, event.clientX) }}
            onPointerUp={(event) => { updateHandle(dragHandle.current ?? 'start', event.clientX); dragHandle.current = null }}
            onPointerCancel={() => { dragHandle.current = null }}
            aria-label={t('times.wordTimingTimeline')}
          >
            {WAVEFORM.map((height, index) => {
              const position = index / WAVEFORM.length
              const selected = position >= rangeStart / rulerDuration && position <= rangeEnd / rulerDuration
              return <span key={index} className={`z-[1] min-w-0 flex-1 rounded-full ${selected ? 'bg-primary-strong' : 'bg-muted/50'}`} style={{ height: `${height}%` }} aria-hidden="true" />
            })}
            <span className="pointer-events-none absolute inset-y-0 bg-primary/10" style={{ left: `${(rangeStart / rulerDuration) * 100}%`, width: `${((rangeEnd - rangeStart) / rulerDuration) * 100}%` }} aria-hidden="true" />
            <span className="pointer-events-none absolute inset-y-0 w-px bg-ink/60" style={{ left: `${(currentPosition / rulerDuration) * 100}%` }} aria-hidden="true" />
            {(['start', 'end'] as const).map((handle) => {
              const value = handle === 'start' ? rangeStart : rangeEnd
              return <button
                key={handle}
                type="button"
                role="slider"
                aria-label={t(handle === 'start' ? 'times.wordStart' : 'times.wordEnd', { word })}
                aria-valuemin={0}
                aria-valuemax={durationMs}
                aria-valuenow={value}
                className="absolute inset-y-0 z-[2] w-5 -translate-x-1/2 cursor-ew-resize touch-none bg-transparent focus-visible:outline-2 focus-visible:outline-primary"
                style={{ left: `${(value / rulerDuration) * 100}%` }}
                onPointerDown={(event) => { event.preventDefault(); dragHandle.current = handle; event.currentTarget.setPointerCapture(event.pointerId) }}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 250 : 50
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') updateHandle(handle, rulerRef.current!.getBoundingClientRect().left + ((value + step * -1) / rulerDuration) * (rulerRef.current?.clientWidth ?? 0))
                  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') updateHandle(handle, rulerRef.current!.getBoundingClientRect().left + ((value + step) / rulerDuration) * (rulerRef.current?.clientWidth ?? 0))
                }}
                data-testid={`word-timing-${handle}-handle`}
              />
            })}
          </div>
          <div className="flex justify-between font-mono text-[11px] tabular-nums text-muted">
            <span>{formatChordTimestamp(currentMs)}</span><span>{formatChordTimestamp(durationMs)}</span>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <label className="space-y-1 text-xs font-medium text-muted">
              <span>{t('times.startShort')}</span>
              <input type="text" inputMode="decimal" className="min-h-10 w-full rounded-lg border border-border-subtle bg-surface px-2 font-mono text-sm tabular-nums text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary" value={startDraft} onChange={(event) => { setStartDraft(event.target.value); setError(null) }} data-testid="word-timing-start-input" />
            </label>
            <span className="pb-2 text-xs text-muted">ms</span>
            <label className="space-y-1 text-xs font-medium text-muted">
              <span>{t('times.endShort')}</span>
              <input type="text" inputMode="decimal" className="min-h-10 w-full rounded-lg border border-border-subtle bg-surface px-2 font-mono text-sm tabular-nums text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary" value={endDraft} onChange={(event) => { setEndDraft(event.target.value); setError(null) }} data-testid="word-timing-end-input" />
            </label>
          </div>

          <div className="flex items-center justify-center gap-1 border-t border-border-subtle pt-2">
            <AudioLines className="me-2 h-4 w-4 text-muted" aria-hidden="true" />
            <Button type="button" variant="secondary" size="sm" disabled={dirty} onClick={() => onNudge(-50)} aria-label={t('times.nudgeWordEarlier', { word })}>−</Button>
            <span className="px-1 text-xs text-muted">50 ms</span>
            <Button type="button" variant="secondary" size="sm" disabled={dirty} onClick={() => onNudge(50)} aria-label={t('times.nudgeWordLater', { word })}>+</Button>
          </div>
          <label className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-border-subtle pt-3 text-xs font-medium text-muted">
            <span>{t('times.playbackSpeed')}</span>
            <input type="range" min="0.1" max="1" step="0.05" value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.currentTarget.value))} aria-label={t('times.playbackSpeed')} data-testid="word-timing-playback-rate" className="w-full accent-primary" />
            <output className="min-w-12 text-right font-mono tabular-nums text-ink">{playbackRate.toFixed(2)}×</output>
          </label>
        </div>
        {error ? <p className="text-sm text-error-ink" role="alert">{error}</p> : null}
      </div>
    </GroupDialog>
  )
}
