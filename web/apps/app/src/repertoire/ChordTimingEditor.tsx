import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'
import { useT } from '../i18n'
import {
  clearChordTimingMark,
  splitChordProLines,
  upsertChordTimingMark,
  type ChordTimingMark,
} from './chordTiming'

/** 10 hours in milliseconds — fallback when no audio duration is available. */
const MAX_FALLBACK_MS = 10 * 60 * 60 * 1000

function linePreview(text: string, emptyLabel: string): string {
  const trimmed = text.trim()
  if (!trimmed) return emptyLabel
  return trimmed.length > 64 ? `${trimmed.slice(0, 64)}…` : trimmed
}

export function ChordTimingEditor({
  chords,
  marks,
  onChange,
  maxMs,
}: {
  chords: string
  marks: ChordTimingMark[]
  onChange: (next: ChordTimingMark[]) => void
  /** Optional upper bound (ms) — e.g., selected audio track duration. */
  maxMs?: number
}) {
  const { t } = useT()
  const lines = splitChordProLines(chords)
  if (!chords.trim()) {
    return (
      <p className="text-xs text-muted" data-testid="chord-timing-empty">
        {t('times.emptyHint')}
      </p>
    )
  }

  const msByLine = new Map(marks.map((m) => [m.lineIndex, m.atMs]))
  const effectiveMax = maxMs != null && Number.isFinite(maxMs) ? maxMs : MAX_FALLBACK_MS

  return (
    <div
      className="space-y-3 rounded-xl border border-border-subtle bg-surface-hover p-3"
      data-testid="chord-timing-editor"
    >
      <p className="text-sm font-semibold text-ink">{t('times.title')}</p>
      <p className="text-xs text-muted">
        {t('times.hint')}
      </p>
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {lines.map((line, lineIndex) => {
          const atMs = msByLine.get(lineIndex)
          return (
            <li
              key={lineIndex}
              className="flex flex-wrap items-end gap-2 rounded-lg bg-surface p-2 ring-1 ring-border-subtle"
            >
              <p className="min-w-0 flex-1 font-mono text-xs text-ink">
                <span className="mr-2 font-sans font-semibold text-muted">{lineIndex + 1}.</span>
                {linePreview(line, t('times.emptyLine'))}
              </p>
              <label className="block">
                <span className="sr-only">{t('times.msPrefix')}{lineIndex + 1}</span>
                <input
                  className={`${fieldClass} w-28`}
                  type="number"
                  min={0}
                  max={effectiveMax}
                  step={1}
                  inputMode="numeric"
                  placeholder="ms"
                  value={atMs ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value
                    if (raw === '') {
                      onChange(clearChordTimingMark(marks, lineIndex))
                      return
                    }
                    const parsed = Number(raw)
                    if (!Number.isInteger(parsed) || parsed < 0 || parsed > effectiveMax) return
                    onChange(upsertChordTimingMark(marks, lineIndex, parsed))
                  }}
                  data-testid={`timing-line-${lineIndex}-ms`}
                />
              </label>
              {atMs != null ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(clearChordTimingMark(marks, lineIndex))}
                  data-testid={`timing-line-${lineIndex}-clear`}
                >
                  {t('times.clear')}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {marks.length > 0 ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange([])}
          data-testid="timing-clear-all"
        >
          {t('times.clearAll')}
        </Button>
      ) : null}
    </div>
  )
}
