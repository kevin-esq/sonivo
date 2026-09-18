import { looksLikeChordPro, parseChordPro, type ChordProLine } from './chordPro'

function directiveLabel(name: string, value: string | null): string {
  switch (name) {
    case 'soc':
    case 'start_of_chorus':
      return 'Estribillo'
    case 'eoc':
    case 'end_of_chorus':
      return 'Fin del estribillo'
    case 'sov':
    case 'start_of_verse':
      return 'Verso'
    case 'eov':
    case 'end_of_verse':
      return 'Fin del verso'
    case 'title':
    case 't':
      return value ? `Título: ${value}` : 'Título'
    case 'subtitle':
    case 'st':
      return value ? `Subtítulo: ${value}` : 'Subtítulo'
    case 'key':
    case 'k':
      return value ? `Tonalidad: ${value}` : 'Tonalidad'
    default:
      return value ? `${name}: ${value}` : name
  }
}

function ChordProLineView({
  line,
  hideChords,
}: {
  line: ChordProLine
  hideChords: boolean
}) {
  if (line.kind === 'empty') {
    return <div className="h-3" aria-hidden />
  }

  if (line.kind === 'comment') {
    return <p className="text-sm italic text-slate-500">{line.text}</p>
  }

  if (line.kind === 'directive') {
    return (
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {directiveLabel(line.name, line.value)}
      </p>
    )
  }

  const hasChord =
    !hideChords && line.segments.some((s) => s.chord != null && s.chord.length > 0)

  return (
    <div className="flex flex-wrap items-end gap-x-0 leading-tight">
      {line.segments.map((segment, index) => (
        <span key={index} className="inline-block whitespace-pre">
          {hasChord ? (
            <span
              className="block min-h-[1.15em] text-sm font-semibold text-primary"
              data-chord={segment.chord ?? undefined}
            >
              {segment.chord && segment.chord.length > 0 ? segment.chord : '\u00A0'}
            </span>
          ) : null}
          <span className="block text-base text-neutral-dark">
            {segment.lyric.length > 0 ? segment.lyric : '\u00A0'}
          </span>
        </span>
      ))}
    </div>
  )
}

export function ChordProView({
  text,
  testId,
  className,
  hideChords = false,
}: {
  text: string
  testId?: string
  className?: string
  /** Vista Cantante: show lyrics only (ADR-0030 P0). */
  hideChords?: boolean
}) {
  const doc = parseChordPro(text)
  return (
    <div
      className={
        className ??
        'max-h-[min(70vh,40rem)] space-y-1 overflow-y-auto rounded-2xl bg-neutral-light p-5 font-sans'
      }
      data-testid={testId}
    >
      {doc.lines.map((line, index) => (
        <ChordProLineView key={index} line={line} hideChords={hideChords} />
      ))}
    </div>
  )
}

/** Render ChordPro when detected; otherwise monospace plain text. */
export function RehearsalBodyView({
  text,
  chordProTestId,
  plainTestId,
  hideChords = false,
}: {
  text: string
  chordProTestId: string
  plainTestId: string
  hideChords?: boolean
}) {
  if (looksLikeChordPro(text)) {
    return (
      <ChordProView text={text} testId={chordProTestId} hideChords={hideChords} />
    )
  }
  return (
    <pre
      className="max-h-[min(70vh,40rem)] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-neutral-light p-5 font-sans text-base leading-relaxed text-neutral-dark"
      data-testid={plainTestId}
    >
      {text}
    </pre>
  )
}
