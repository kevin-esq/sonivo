import { useT } from '../i18n'
import { buildChordDiagram } from './chordDiagram'

const STRINGS = 6
const LEFT = 14
const TOP = 18
const STRING_GAP = 11
const FRET_GAP = 15
const DOT_RADIUS = 3.4

/** Fretboard SVG for a chord name. Falls back to a neutral placeholder. */
export function ChordDiagramCard({ chord, className }: { chord: string; className?: string }) {
  const { t } = useT()
  const diagram = buildChordDiagram(chord)
  const label = t('arrangement.chordDiagramTitle', { chord })

  if (!diagram) {
    return (
      <div
        className={`flex w-20 flex-col items-center gap-1 rounded-lg border border-border-subtle bg-surface px-2 py-2 ${className ?? ''}`}
      >
        <span className="font-mono text-xs font-semibold text-ink">{chord}</span>
        <span className="text-[10px] text-muted">{t('arrangement.chordDiagramUnavailable')}</span>
      </div>
    )
  }

  const rows = diagram.fretCount
  const width = LEFT * 2 + STRING_GAP * (STRINGS - 1)
  const height = TOP + FRET_GAP * rows + 12
  const bottom = TOP + FRET_GAP * rows

  const stringX = (index: number) => LEFT + index * STRING_GAP
  const dotY = (fret: number) => TOP + (fret - diagram.baseFret + 0.5) * FRET_GAP
  const barre = diagram.barre

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
    >
      {Array.from({ length: STRINGS }, (_, index) => (
        <line
          key={`string-${index}`}
          x1={stringX(index)}
          x2={stringX(index)}
          y1={TOP}
          y2={bottom}
          stroke="currentColor"
          strokeWidth={0.8}
          className="text-muted"
        />
      ))}
      {Array.from({ length: rows + 1 }, (_, index) => (
        <line
          key={`fret-${index}`}
          x1={LEFT}
          x2={LEFT + STRING_GAP * (STRINGS - 1)}
          y1={TOP + index * FRET_GAP}
          y2={TOP + index * FRET_GAP}
          stroke="currentColor"
          strokeWidth={index === 0 && diagram.baseFret === 1 ? 2.4 : 0.8}
          className="text-muted"
        />
      ))}
      {diagram.baseFret > 1 ? (
        <text x={LEFT - 5} y={TOP + FRET_GAP * 0.75} textAnchor="end" fontSize={8} className="fill-current text-muted">
          {diagram.baseFret}
        </text>
      ) : null}
      {barre ? (
        <rect
          data-testid="chord-diagram-barre"
          x={stringX(barre.from) - DOT_RADIUS}
          y={dotY(barre.fret) - DOT_RADIUS}
          width={stringX(barre.to) - stringX(barre.from) + DOT_RADIUS * 2}
          height={DOT_RADIUS * 2}
          rx={DOT_RADIUS}
          className="fill-current text-primary-ink"
        />
      ) : null}
      {diagram.frets.map((fret, index) => {
        const x = stringX(index)
        if (fret < 0) {
          return (
            <text key={`mark-${index}`} x={x} y={TOP - 5} textAnchor="middle" fontSize={8} className="fill-current text-muted">
              ×
            </text>
          )
        }
        if (fret === 0) {
          return (
            <circle
              key={`mark-${index}`}
              cx={x}
              cy={TOP - 8}
              r={2.6}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.9}
              className="text-muted"
            />
          )
        }
        // Strings covered by the barre are already drawn as the bar.
        if (barre && fret === barre.fret && index >= barre.from && index <= barre.to) return null
        return <circle key={`mark-${index}`} cx={x} cy={dotY(fret)} r={DOT_RADIUS} className="fill-current text-primary-ink" />
      })}
    </svg>
  )
}
