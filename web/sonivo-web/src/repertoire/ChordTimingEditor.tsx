import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'
import {
  clearChordTimingMark,
  splitChordProLines,
  upsertChordTimingMark,
  type ChordTimingMark,
} from './chordTiming'

/** 10 hours in milliseconds — fallback when no audio duration is available. */
const MAX_FALLBACK_MS = 10 * 60 * 60 * 1000

function linePreview(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return '(línea vacía)'
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
  const lines = splitChordProLines(chords)
  if (!chords.trim()) {
    return (
      <p className="text-xs text-slate-500" data-testid="chord-timing-empty">
        Escribe acordes ChordPro arriba para marcar tiempos de cada línea.
      </p>
    )
  }

  const msByLine = new Map(marks.map((m) => [m.lineIndex, m.atMs]))
  const effectiveMax = maxMs != null && Number.isFinite(maxMs) ? maxMs : MAX_FALLBACK_MS

  return (
    <div
      className="space-y-3 rounded-xl border border-slate-200 bg-neutral-light p-3"
      data-testid="chord-timing-editor"
    >
      <p className="text-sm font-semibold text-neutral-dark">Tiempos de seguimiento</p>
      <p className="text-xs text-slate-500">
        Indica en qué milisegundo de la pista de práctica empieza cada línea. En Practicar,
        activa «Seguir letra» para resaltarla al reproducir.
      </p>
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {lines.map((line, lineIndex) => {
          const atMs = msByLine.get(lineIndex)
          return (
            <li
              key={lineIndex}
              className="flex flex-wrap items-end gap-2 rounded-lg bg-white p-2 ring-1 ring-slate-200"
            >
              <p className="min-w-0 flex-1 font-mono text-xs text-slate-700">
                <span className="mr-2 font-sans font-semibold text-slate-500">{lineIndex + 1}.</span>
                {linePreview(line)}
              </p>
              <label className="block">
                <span className="sr-only">Tiempo en milisegundos, línea {lineIndex + 1}</span>
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
                  Quitar
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
          Quitar todas las marcas
        </Button>
      ) : null}
    </div>
  )
}
