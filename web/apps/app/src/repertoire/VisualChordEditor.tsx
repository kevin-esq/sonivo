import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'
import { FileDropzone } from '../ui/FileDropzone'
import { useT } from '../i18n'
import { PracticePlayer } from './PracticePlayer'
import { useAudioPlayer } from './AudioPlayerContext'
import { chordSuggestionsForKey } from './chordPro'
import {
  listChordCursors,
  lyricsToDocument,
  moveChordToSlot,
  parseChordList,
  parseChordProToDigitizer,
  placeChordsOnDocument,
  serializeDigitizerDocument,
  type ChordCursor,
  type DigitizerDocument,
} from './chordProDigitizer'
import {
  activeChordLineIndex,
  clearChordTimingMark,
  nudgeChordWordTiming,
  splitChordProLines,
  upsertChordTimingMark,
  type ChordTimingTimeline,
} from './chordTiming'
import type { PracticeAudioSource } from './pickPracticeAudio'

export type ArrangementEditorMode = 'lyrics' | 'chords' | 'timing'

type VisualChordEditorProps = {
  lyrics: string
  chords: string
  onLyricsChange: (value: string) => void
  onChordsChange: (value: string) => void
  timingTimeline: ChordTimingTimeline
  onTimingChange: (value: ChordTimingTimeline) => void
  groupId: string
  arrangementId: string
  arrangementLabel: string
  defaultKey: string
  audioTracks: PracticeAudioSource[]
  importFile: File | null
  importError: boolean
  onImportFileChange: (file: File | null) => void
  mode: ArrangementEditorMode
  editorTitle: string
  editorHint: string
  additionalLyricsImport?: ReactNode
}

function formatTimestamp(milliseconds: number): string {
  const seconds = milliseconds / 1000
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds - minutes * 60
  const precision = milliseconds % 1000 === 0 ? 0 : 1
  return `${minutes}:${remainder.toFixed(precision).padStart(precision ? 4 : 2, '0')}`
}

function parseTimestamp(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(value.trim())
  if (!match) return null
  const minutes = Number(match[1] ?? 0)
  const seconds = Number(match[2])
  const fraction = Number((match[3] ?? '').padEnd(3, '0'))
  if (seconds >= 60 && match[1] != null) return null
  return (minutes * 60 + seconds) * 1000 + fraction
}

function normalizeLines(value: string): string[] {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

function chordTokens(document: DigitizerDocument): string[] {
  return listChordCursors(document)
    .map(({ lineIndex, slotIndex }) => document.lines[lineIndex]?.slots[slotIndex]?.chord ?? '')
    .filter(Boolean)
}

function isChordToken(value: string): boolean {
  return /^[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add|M)?\d*(?:\/[A-G](?:#|b)?)?$/i.test(value)
}

function isChordList(value: string): boolean {
  const tokens = parseChordList(value)
  return tokens.length > 0 && tokens.every(isChordToken)
}

function documentLyrics(document: DigitizerDocument): string {
  return document.lines
    .map((line) => line.slots.map((slot) => slot.text).filter(Boolean).join(' '))
    .join('\n')
}

function alignDocumentLyrics(document: DigitizerDocument, lyrics: string, source: string): DigitizerDocument {
  const lyricLines = normalizeLines(lyrics)
  const sourceLines = normalizeLines(source)
  let lyricIndex = 0
  const lines: DigitizerDocument['lines'] = []
  for (let sourceIndex = 0; sourceIndex < Math.max(sourceLines.length, lyricLines.length); sourceIndex += 1) {
    const rawSourceLine = sourceLines[sourceIndex] ?? ''
    if (/^\s*\{[^}]+\}\s*$/.test(rawSourceLine)) {
      lines.push(document.lines[sourceIndex] ?? { slots: [] })
      continue
    }
    const lyricLine = lyricLines[lyricIndex++] ?? ''
    const words = lyricLine.trim() ? lyricLine.trim().split(/\s+/) : []
    const previous = document.lines[sourceIndex]?.slots ?? []
    const slots = words.map((text, slotIndex) => ({ text, chord: previous[slotIndex]?.chord ?? null }))
    previous.slice(words.length).forEach((slot) => {
      if (!slot.text && slot.chord) slots.push({ text: '', chord: slot.chord })
    })
    lines.push({ slots })
  }
  return { lines }
}

function createDocument(lyrics: string, chords: string): DigitizerDocument {
  const parsed = parseChordProToDigitizer(chords)
  const hasInlineChords = listChordCursors(parsed).length > 0
  const hasDirectives = /^\s*\{[^}]+\}\s*$/m.test(chords)
  if (chords.trim() && (hasInlineChords || hasDirectives || !lyrics.trim())) {
    if (!lyrics.trim() && isChordList(chords)) {
      return placeChordsOnDocument(lyricsToDocument(''), parseChordList(chords))
    }
    return lyrics.trim() && hasInlineChords ? alignDocumentLyrics(parsed, lyrics, chords) : parsed
  }
  if (!lyrics.trim()) return parsed
  const base = lyricsToDocument(lyrics)
  return chords.trim() && chords.trim() !== lyrics.trim() && isChordList(chords)
    ? placeChordsOnDocument(base, parseChordList(chords))
    : base
}

function editorLyrics(lyrics: string, chords: string, document: DigitizerDocument): string {
  return /^\s*\{[^}]+\}\s*$/m.test(chords) ? documentLyrics(document) : lyrics.trim() ? lyrics : documentLyrics(document)
}

function applyLyrics(document: DigitizerDocument, value: string): DigitizerDocument {
  const lines = normalizeLines(value)
  return {
    lines: lines.map((line, lineIndex) => {
      const previous = document.lines[lineIndex]?.slots ?? []
      const words = line.trim() ? line.trim().split(/\s+/) : []
      const slots = words.map((text, slotIndex) => ({
        text,
        chord: previous[slotIndex]?.chord ?? null,
      }))
      previous.slice(words.length).forEach((slot) => {
        if (!slot.text && slot.chord) slots.push({ text: '', chord: slot.chord })
      })
      return { slots }
    }),
  }
}

function serializeKeepingDirectives(document: DigitizerDocument, original: string): string {
  const sourceLines = normalizeLines(original)
  const outputLines = document.lines.map((line, lineIndex) => {
    const sourceLine = sourceLines[lineIndex] ?? ''
    if (/^\s*\{[^}]+\}\s*$/.test(sourceLine)) return sourceLine.trim()
    return serializeDigitizerDocument({ lines: [line] })
  })
  sourceLines.forEach((line, lineIndex) => {
    if (/^\s*\{[^}]+\}\s*$/.test(line) && lineIndex >= outputLines.length) {
      outputLines.push(line.trim())
    }
  })
  return outputLines.join('\n')
}

export function VisualChordEditor({
  lyrics,
  chords,
  onLyricsChange,
  onChordsChange,
  timingTimeline,
  onTimingChange,
  groupId,
  arrangementId,
  arrangementLabel,
  defaultKey,
  audioTracks,
  importFile,
  importError,
  onImportFileChange,
  mode,
  editorTitle,
  editorHint,
  additionalLyricsImport,
}: VisualChordEditorProps) {
  const { t } = useT()
  const audioPlayer = useAudioPlayer()
  const [document, setDocument] = useState<DigitizerDocument>(() => {
    return createDocument(lyrics, chords)
  })
  const [lyricsDraft, setLyricsDraft] = useState(() => {
    const initial = createDocument(lyrics, chords)
    return editorLyrics(lyrics, chords, initial)
  })
  const [chordDraft, setChordDraft] = useState('')
  const [manualChords, setManualChords] = useState<string[]>([])
  const [selectedChord, setSelectedChord] = useState<string | null>(null)
  const [selectedCursor, setSelectedCursor] = useState<ChordCursor | null>(null)
  const [editingTimeLine, setEditingTimeLine] = useState<number | null>(null)
  const [timeDraft, setTimeDraft] = useState('')
  const [timeError, setTimeError] = useState(false)
  const [savedSource, setSavedSource] = useState({ lyrics, chords })
  const [currentAudioMs, setCurrentAudioMs] = useState(0)
  const [instrumentalStartMs, setInstrumentalStartMs] = useState<number | null>(null)
  const [selectedLineIndex, setSelectedLineIndex] = useState(0)

  useEffect(() => {
    if (savedSource.lyrics === lyrics && savedSource.chords === chords) return
    const next = createDocument(lyrics, chords)
    setDocument(next)
    setLyricsDraft(editorLyrics(lyrics, chords, next))
    setSavedSource({ lyrics, chords })
    setSelectedCursor(null)
  }, [lyrics, chords, savedSource])

  const cursors = listChordCursors(document)
  const palette = Array.from(new Set([...chordTokens(document), ...manualChords, selectedChord].filter(Boolean))) as string[]
  const suggestedChords = chordSuggestionsForKey(defaultKey)
  const timingMarks = timingTimeline.lineMarks
  const timeByLine = new Map(timingMarks.map((mark) => [mark.lineIndex, mark.atMs]))
  const timeByWord = new Map(timingTimeline.wordMarks.map((mark) => [`${mark.lineIndex}:${mark.wordIndex}`, mark]))
  const activeLine = activeChordLineIndex(timingMarks, currentAudioMs)
  const lineCount = Math.max(document.lines.length, splitChordProLines(chords).length)

  function updateTiming(lineIndex: number, atMs: number | null) {
    const next = atMs == null
      ? clearChordTimingMark(timingMarks, lineIndex)
      : upsertChordTimingMark(timingMarks, lineIndex, atMs)
    onLyricsChange(lyricsDraft)
    onChordsChange(serializeKeepingDirectives(document, chords))
    onTimingChange({ ...timingTimeline, lineMarks: next })
  }

  function markWord(lineIndex: number, wordIndex: number) {
    const startMs = Math.max(0, Math.round(audioPlayer.getCurrentTime() * 1000))
    setCurrentAudioMs(startMs)
    const sorted = [...timingTimeline.wordMarks].sort((a, b) => a.startMs - b.startMs)
    const previous = [...sorted].reverse().find((mark) => mark.startMs < startMs && mark.endMs > startMs)
    const next = sorted.find((mark) => mark.startMs > startMs)
    const nextMarks = timingTimeline.wordMarks
      .filter((mark) => mark.lineIndex !== lineIndex || mark.wordIndex !== wordIndex)
      .map((mark) => previous && mark.lineIndex === previous.lineIndex && mark.wordIndex === previous.wordIndex
        ? { ...mark, endMs: startMs }
        : mark)
    const endMs = next?.startMs && next.startMs > startMs ? next.startMs : startMs + 600
    nextMarks.push({ lineIndex, wordIndex, startMs, endMs })
    onTimingChange({
      ...timingTimeline,
      lineMarks: upsertChordTimingMark(timingMarks, lineIndex, startMs),
      wordMarks: nextMarks,
    })
  }

  function nudgeWord(lineIndex: number, wordIndex: number, deltaMs: number) {
    onTimingChange({
      ...timingTimeline,
      wordMarks: nudgeChordWordTiming(timingTimeline.wordMarks, lineIndex, wordIndex, deltaMs),
    })
  }

  function clearWord(lineIndex: number, wordIndex: number) {
    onTimingChange({
      ...timingTimeline,
      wordMarks: timingTimeline.wordMarks.filter((mark) => mark.lineIndex !== lineIndex || mark.wordIndex !== wordIndex),
    })
  }

  function closeCurrentWord() {
    const audioMs = Math.max(0, Math.round(audioPlayer.getCurrentTime() * 1000))
    const active = timingTimeline.wordMarks.find((mark) => mark.startMs < audioMs && mark.endMs > audioMs)
    if (!active) return
    onTimingChange({
      ...timingTimeline,
      wordMarks: timingTimeline.wordMarks.map((mark) => mark === active
        ? { ...mark, endMs: audioMs }
        : mark),
    })
  }

  function toggleInstrumental() {
    const audioMs = Math.max(0, Math.round(audioPlayer.getCurrentTime() * 1000))
    setCurrentAudioMs(audioMs)
    if (instrumentalStartMs == null) {
      setInstrumentalStartMs(audioMs)
      return
    }
    if (audioMs > instrumentalStartMs) {
      onTimingChange({
        ...timingTimeline,
        instrumentals: [...timingTimeline.instrumentals, { type: 'instrumental' as const, startMs: instrumentalStartMs, endMs: audioMs }]
          .sort((a, b) => a.startMs - b.startMs),
      })
    }
    setInstrumentalStartMs(null)
  }

  function beginTimeEdit(lineIndex: number) {
    const mark = timeByLine.get(lineIndex)
    setTimeDraft(mark == null ? '' : formatTimestamp(mark))
    setTimeError(false)
    setEditingTimeLine(lineIndex)
  }

  function commitTimeEdit(lineIndex: number) {
    const value = timeDraft.trim()
    if (!value) {
      updateTiming(lineIndex, null)
      setEditingTimeLine(null)
      setTimeError(false)
      return
    }
    const milliseconds = parseTimestamp(value)
    if (milliseconds == null) {
      setTimeError(true)
      return
    }
    updateTiming(lineIndex, milliseconds)
    setEditingTimeLine(null)
    setTimeError(false)
  }

  const handleAudioTime = useCallback((seconds: number) => {
    setCurrentAudioMs(Math.round(seconds * 1000))
  }, [])

  const sheetLines = Array.from({ length: lineCount }, (_, lineIndex) => ({
    lineIndex,
    line: document.lines[lineIndex] ?? { slots: [] },
  }))

  function updateDocument(next: DigitizerDocument, nextLyrics = lyricsDraft) {
    setDocument(next)
    onLyricsChange(nextLyrics)
    onChordsChange(serializeKeepingDirectives(next, chords))
  }

  function editLyrics(value: string) {
    setLyricsDraft(value)
    updateDocument(applyLyrics(document, value), value)
  }

  function addChord() {
    const values = parseChordList(chordDraft)
    if (values.length === 0) return
    setManualChords((current) => Array.from(new Set([...current, ...values])))
    setSelectedChord(values[0] ?? null)
    setSelectedCursor(null)
    setChordDraft('')
  }

  function distributeChords() {
    const values = parseChordList(chordDraft)
    if (values.length === 0) return
    const base = applyLyrics(document, lyricsDraft)
    const next = placeChordsOnDocument(base, values)
    setManualChords((current) => Array.from(new Set([...current, ...values])))
    setSelectedChord(null)
    setSelectedCursor(null)
    updateDocument(next)
  }

  function placeChord(lineIndex: number, slotIndex: number) {
    if (selectedCursor) {
      const sourceIndex = cursors.findIndex(
        (cursor) => cursor.lineIndex === selectedCursor.lineIndex && cursor.slotIndex === selectedCursor.slotIndex,
      )
      if (sourceIndex < 0) return
      const next = moveChordToSlot(document, sourceIndex, lineIndex, slotIndex)
      setSelectedCursor(null)
      updateDocument(next)
      return
    }
    if (!selectedChord) return
    const next = {
      lines: document.lines.map((line) => ({ slots: line.slots.map((slot) => ({ ...slot })) })),
    }
    const target = next.lines[lineIndex]?.slots[slotIndex]
    if (!target) return
    const displacedChord = target.chord
    target.chord = selectedChord
    if (displacedChord && displacedChord !== selectedChord) setSelectedChord(displacedChord)
    updateDocument(next)
  }

  function removeSelectedChord() {
    if (!selectedCursor) return
    const cursorIndex = cursors.findIndex(
      (cursor) => cursor.lineIndex === selectedCursor.lineIndex && cursor.slotIndex === selectedCursor.slotIndex,
    )
    const cursor = cursors[cursorIndex]
    if (!cursor) return
    const next = {
      lines: document.lines.map((line) => ({ slots: line.slots.map((slot) => ({ ...slot })) })),
    }
    const slot = next.lines[cursor.lineIndex]?.slots[cursor.slotIndex]
    if (slot) slot.chord = null
    setSelectedCursor(null)
    updateDocument(next)
  }

  function downloadChordPro(extension: 'cho' | 'txt') {
    const source = serializeKeepingDirectives(document, chords)
    const blob = new Blob([source], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    const filename = arrangementLabel.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, '-')
    link.href = url
    link.download = `${filename || 'arrangement'}.${extension}`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface" aria-labelledby="visual-chord-editor-title" data-testid="chordpro-digitizer" data-visual-editor="true">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-surface-hover px-5 py-4 sm:px-6">
        <div className="max-w-xl space-y-1">
          <h3 id="visual-chord-editor-title" className="text-lg font-semibold text-ink">{editorTitle}</h3>
          <p className="text-sm text-muted">{editorHint}</p>
        </div>
        <div className="space-y-1 sm:text-right">
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {mode === 'chords' ? <>
              <Button type="button" variant="secondary" size="sm" onClick={() => downloadChordPro('cho')} disabled={!lyricsDraft.trim() && !chords.trim()} data-testid="arrangement-chordpro-export">
                {t('arrangement.exportChordPro')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => downloadChordPro('txt')} disabled={!lyricsDraft.trim() && !chords.trim()} data-testid="arrangement-text-export">
                {t('arrangement.exportText')}
              </Button>
            </> : null}
          </div>
          {mode === 'chords' ? <p className="max-w-xs text-xs text-muted sm:ml-auto">{t('arrangement.exportChordProHint')}</p> : null}
        </div>
      </header>

      <div className={`grid gap-5 p-4 sm:p-6 ${mode === 'lyrics' ? 'grid-cols-1' : mode === 'chords' ? 'xl:grid-cols-[minmax(20rem,0.85fr)_minmax(0,1.5fr)]' : ''}`}>
        <div className="min-w-0 w-full space-y-5">
          {mode === 'lyrics' ? <div className="space-y-3">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-ink">{t('arrangement.lyricsOptional')}</span>
              <textarea
                className={`${fieldClass} min-h-64 resize-y font-sans text-base leading-8`}
                rows={7}
                value={lyricsDraft}
                onChange={(event) => editLyrics(event.target.value)}
                spellCheck
                data-testid="digitizer-lyrics"
              />
            </label>
            <p className="text-sm leading-6 text-muted">{t('arrangement.visualLyricsHelp')}</p>
            <FileDropzone
              title={t('arrangement.importLabel')}
              description={t('arrangement.importHint')}
              accept=".cho,.chordpro,.chord,.crd,.txt,text/plain"
              file={importFile}
              onFileChange={onImportFileChange}
              testId="arrangement-chords-import"
              compact
            />
            {importError ? <p className="text-sm text-red-600" role="alert">{t('arrangement.importError')}</p> : null}
            {additionalLyricsImport}
          </div> : null}

          {mode === 'chords' ? <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-hover p-4 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="block w-full shrink-0 space-y-2" htmlFor="visual-chord-input">
                <span className="block text-sm font-semibold text-ink">{t('arrangement.addChordLabel')}</span>
                <input
                  id="visual-chord-input"
                  className={fieldClass}
                  value={chordDraft}
                  onChange={(event) => setChordDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addChord()
                    }
                  }}
                  placeholder={t('arrangement.chordExample')}
                  maxLength={120}
                  data-testid="digitizer-chords"
                />
              </label>
              <Button type="button" variant="secondary" onClick={addChord} disabled={!chordDraft.trim()}>
                {t('arrangement.addChordButton')}
              </Button>
              <Button type="button" onClick={distributeChords} disabled={!chordDraft.trim() || !lyricsDraft.trim()} data-testid="digitizer-generate">
                {t('arrangement.distributeChords')}
              </Button>
            </div>
            <p className="text-sm leading-6 text-muted">{t('arrangement.distributeChordHint')}</p>
            {palette.length > 0 ? (
              <div className="space-y-2" aria-label={t('arrangement.chordPalette')}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('arrangement.chordPalette')}</p>
                <div className="flex flex-wrap gap-2">
                  {palette.map((chord) => (
                    <button
                      key={chord}
                      type="button"
                      className={`min-h-11 rounded-xl px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selectedChord === chord && !selectedCursor ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface text-ink ring-1 ring-border-subtle hover:bg-primary/10'}`}
                      aria-pressed={selectedChord === chord && !selectedCursor}
                      onClick={() => {
                        setSelectedChord(chord)
                        setSelectedCursor(null)
                      }}
                    >
                      {chord}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {suggestedChords.length > 0 ? (
              <div className="space-y-2" aria-label={t('arrangement.keyChordSuggestions', { key: defaultKey })}>
                <div>
                  <p className="text-sm font-semibold text-ink">{t('arrangement.keyChordSuggestions', { key: defaultKey })}</p>
                  <p className="text-xs text-muted">{t('arrangement.keyChordSuggestionsHint')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestedChords.map((chord) => (
                    <button
                      key={chord}
                      type="button"
                      className={`min-h-11 rounded-xl px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selectedChord === chord && !selectedCursor ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface text-ink ring-1 ring-border-subtle hover:bg-primary/10'}`}
                      aria-pressed={selectedChord === chord && !selectedCursor}
                      onClick={() => {
                        setManualChords((current) => Array.from(new Set([...current, chord])))
                        setSelectedChord(chord)
                        setSelectedCursor(null)
                      }}
                    >
                      {chord}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 text-sm text-primary-ink" role="status">
              {selectedCursor ? (
                <>
                  <span>{t('arrangement.moveChordHint')}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={removeSelectedChord}>{t('arrangement.removeChord')}</Button>
                </>
              ) : selectedChord ? (
                <span>{t('arrangement.placeSelectedChordHint', { chord: selectedChord })}</span>
              ) : (
                <span>{t('arrangement.visualChordHelp')}</span>
              )}
            </div>
          </div> : null}

          {mode === 'timing' ? <div className="space-y-4">
            {audioTracks.length > 0 ? (
              <PracticePlayer
                groupId={groupId}
                arrangementId={arrangementId}
                tracks={audioTracks}
                onCurrentTimeChange={handleAudioTime}
              />
            ) : (
              <div className="rounded-xl border border-border-subtle bg-surface-hover p-4">
                <p className="text-sm font-semibold text-ink">{t('times.audioTitle')}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{t('times.noAudioHint')}</p>
              </div>
            )}
            {audioTracks.length > 0 ? <p className="text-sm leading-6 text-muted">{t('times.audioHint')}</p> : null}
            {!lyricsDraft.trim() ? <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-primary-ink" role="status">{t('times.addLyricsHint')}</p> : null}
            {audioTracks.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface p-3">
                <Button type="button" variant={instrumentalStartMs == null ? 'secondary' : 'primary'} onClick={toggleInstrumental}>
                  {instrumentalStartMs == null ? t('times.startInstrumental') : t('times.endInstrumental')}
                </Button>
                {instrumentalStartMs != null ? <span className="text-sm text-muted">{formatTimestamp(instrumentalStartMs)}–{formatTimestamp(currentAudioMs)}</span> : null}
                {timingTimeline.wordMarks.some((mark) => mark.startMs < currentAudioMs && mark.endMs > currentAudioMs) ? (
                  <Button type="button" variant="ghost" onClick={closeCurrentWord}>{t('times.closeCurrentWord')}</Button>
                ) : null}
                {timingTimeline.instrumentals.map((interval, index) => (
                  <button
                    key={`${interval.startMs}-${interval.endMs}`}
                    type="button"
                    className="min-h-9 rounded-lg bg-surface-hover px-3 text-xs font-medium text-ink hover:bg-primary/10"
                    onClick={() => onTimingChange({
                      ...timingTimeline,
                      instrumentals: timingTimeline.instrumentals.filter((_, itemIndex) => itemIndex !== index),
                    })}
                    aria-label={t('times.removeInstrumental', { start: formatTimestamp(interval.startMs), end: formatTimestamp(interval.endMs) })}
                  >
                    {t('times.instrumentalLabel')} · {formatTimestamp(interval.startMs)}–{formatTimestamp(interval.endMs)} · {t('times.clear')}
                  </button>
                ))}
              </div>
            ) : null}
            {timeError ? <p className="text-sm font-medium text-error-ink" role="alert">{t('times.invalidTimestamp')}</p> : null}
          </div> : null}
        </div>

        {mode !== 'lyrics' ? <div className="min-w-0 overflow-hidden rounded-2xl border border-border-subtle bg-surface text-ink" data-testid="digitizer-studio" data-visual-song-sheet="true">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
            <div>
              <h4 className="font-semibold">{t('arrangement.songSheetTitle')}</h4>
              <p className="mt-1 text-sm text-muted">{t('arrangement.songSheetHint')}</p>
            </div>
            <span className="rounded-full bg-surface-hover px-3 py-1 text-xs font-semibold text-ink" aria-live="off">
              {formatTimestamp(currentAudioMs)}
            </span>
          </div>
          <div className="min-h-56 divide-y divide-border-subtle px-4 sm:px-6 xl:max-h-[min(62vh,42rem)] xl:overflow-y-auto xl:overscroll-contain" role="region" aria-label={t('arrangement.songSheetTitle')} tabIndex={0}>
            {(lyricsDraft.trim() || timingMarks.length > 0 || timingTimeline.wordMarks.length > 0) ? sheetLines.map(({ line, lineIndex }) => {
              const markedAtMs = timeByLine.get(lineIndex)
              const isActiveLine = activeLine === lineIndex
              return (
                <div key={lineIndex} data-testid={`digitizer-line-${lineIndex}`} className={`flex flex-col gap-3 py-4 xl:flex-row xl:items-center xl:gap-5 ${isActiveLine ? 'bg-primary/10 -mx-4 px-4 xl:-mx-6 xl:px-6' : ''}`} aria-current={isActiveLine ? 'true' : undefined}>
                  {mode === 'timing' ? (
                    <button type="button" className={`min-h-11 min-w-11 shrink-0 rounded-lg font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selectedLineIndex === lineIndex ? 'bg-primary/10 font-bold text-primary-ink' : 'text-muted'}`} aria-label={t('times.selectLine', { line: lineIndex + 1 })} aria-pressed={selectedLineIndex === lineIndex} data-testid={`digitizer-select-line-${lineIndex}`} onClick={() => setSelectedLineIndex(lineIndex)}>{String(lineIndex + 1).padStart(2, '0')}</button>
                  ) : <span className="w-8 shrink-0 font-mono text-sm text-muted">{String(lineIndex + 1).padStart(2, '0')}</span>}
                  <div className="flex min-h-10 min-w-0 flex-1 flex-wrap items-end gap-x-1 gap-y-3">
                    {line.slots.length ? line.slots.map((slot, slotIndex) => {
                      const cursor = cursors.find((item) => item.lineIndex === lineIndex && item.slotIndex === slotIndex)
                      const isMoving = selectedCursor?.lineIndex === lineIndex && selectedCursor.slotIndex === slotIndex
                      const wordIndex = line.slots.slice(0, slotIndex).filter((item) => item.text.trim()).length
                      const wordTiming = slot.text ? timeByWord.get(`${lineIndex}:${wordIndex}`) : undefined
                      return (
                        <span key={`${lineIndex}-${slotIndex}`} className="inline-flex flex-col items-start">
                          {slot.chord ? mode === 'chords' ? (
                            <button
                              type="button"
                              className={`mb-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold text-primary-ink transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${isMoving ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                              aria-label={t('arrangement.selectChordOnWord', { chord: slot.chord, word: slot.text || t('arrangement.chordOnly') })}
                              aria-pressed={isMoving}
                              onClick={() => {
                                setSelectedCursor(cursor ?? null)
                                setSelectedChord(null)
                              }}
                            >
                              {slot.chord}
                            </button>
                          ) : <span className="mb-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold text-primary-ink">{slot.chord}</span> : <span className="mb-0.5 h-5" aria-hidden="true" />}
                          {slot.text ? <span className="inline-flex flex-col items-start">
                            {mode === 'chords' && (selectedChord || selectedCursor) ? (
                              <button
                                type="button"
                                className="rounded-md px-1.5 py-1 text-left text-base leading-6 text-ink transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                aria-label={t('arrangement.placeChordOnWord', { chord: selectedCursor ? t('arrangement.moveSelectedChord') : selectedChord ?? t('arrangement.noChordSelected'), word: slot.text })}
                                onClick={() => placeChord(lineIndex, slotIndex)}
                              >
                                {slot.text}
                              </button>
                            ) : <span className="px-1.5 py-1 text-base leading-6">{slot.text}</span>}
                            {mode === 'timing' && selectedLineIndex === lineIndex && audioTracks.length > 0 ? <div className="flex flex-wrap items-center gap-1.5 px-1.5">
                              <button
                                type="button"
                                className="min-h-11 rounded-lg px-3 text-xs font-semibold text-primary-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                onClick={() => markWord(lineIndex, wordIndex)}
                                aria-label={t('times.markWord', { word: slot.text })}
                              >
                                {wordTiming ? formatTimestamp(wordTiming.startMs) : t('times.markWordShort')}
                              </button>
                              {wordTiming ? <>
                                <span className="text-xs text-muted">– {formatTimestamp(wordTiming.endMs)}</span>
                                <button type="button" className="min-h-11 min-w-11 rounded-lg text-sm text-muted hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={() => nudgeWord(lineIndex, wordIndex, -50)} aria-label={t('times.nudgeWordEarlier', { word: slot.text })}>−</button>
                                <button type="button" className="min-h-11 min-w-11 rounded-lg text-sm text-muted hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={() => nudgeWord(lineIndex, wordIndex, 50)} aria-label={t('times.nudgeWordLater', { word: slot.text })}>+</button>
                                <button type="button" className="min-h-11 rounded-lg px-2 text-xs text-muted hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={() => clearWord(lineIndex, wordIndex)} aria-label={t('times.clearWord', { word: slot.text })}>{t('times.clear')}</button>
                              </> : null}
                            </div> : null}
                          </span> : null}
                        </span>
                      )
                    }) : <span className="min-h-5 w-full" aria-hidden="true" />}
                  </div>
                  {mode === 'timing' ? <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
                      {editingTimeLine === lineIndex ? (
                        <>
                          <input
                            className="min-h-11 w-28 rounded-lg border border-border-subtle bg-surface px-3 font-mono text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            type="text"
                            inputMode="text"
                            placeholder={t('times.timestampExample')}
                            value={timeDraft}
                            autoFocus
                            aria-label={t('times.lineTimeLabel', { line: lineIndex + 1 })}
                            onChange={(event) => setTimeDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') commitTimeEdit(lineIndex)
                              if (event.key === 'Escape') {
                                setEditingTimeLine(null)
                                setTimeError(false)
                              }
                            }}
                          />
                          <Button type="button" size="sm" onClick={() => commitTimeEdit(lineIndex)}>{t('times.saveTime')}</Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingTimeLine(null); setTimeError(false) }}>{t('times.cancelEdit')}</Button>
                        </>
                      ) : (
                        <>
                          <span className={`min-w-16 rounded-lg px-3 py-2 text-center font-mono text-sm font-semibold ${markedAtMs != null ? 'bg-surface-hover text-ink' : 'bg-surface-hover text-muted'}`}>
                            {markedAtMs != null ? formatTimestamp(markedAtMs) : t('times.notMarked')}
                          </span>
                          <Button type="button" variant={markedAtMs != null ? 'secondary' : 'primary'} size="sm" onClick={() => {
                            if (!audioTracks.length) {
                              beginTimeEdit(lineIndex)
                              return
                            }
                            const atMs = Math.max(0, Math.round(audioPlayer.getCurrentTime() * 1000))
                            setCurrentAudioMs(atMs)
                            updateTiming(lineIndex, atMs)
                          }}>
                            {audioTracks.length ? t(markedAtMs != null ? 'times.replaceMark' : 'times.markCurrentTime') : t('times.addTime')}
                          </Button>
                          {markedAtMs != null ? (
                            <>
                              <Button type="button" variant="ghost" size="sm" onClick={() => beginTimeEdit(lineIndex)}>{t('times.editTime')}</Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => updateTiming(lineIndex, null)}>{t('times.clear')}</Button>
                            </>
                          ) : null}
                        </>
                      )}
                  </div> : null}
                </div>
              )
            }) : <p className="py-10 text-center text-sm text-muted">{t('arrangement.songSheetEmpty')}</p>}
          </div>
          {selectedCursor ? (
            <div className="flex items-center justify-between gap-3 border-t border-border-subtle bg-surface-hover px-5 py-3 sm:px-6">
              <span className="text-sm text-ink">{t('arrangement.moveChordHint')}</span>
              <Button type="button" variant="ghost" size="sm" onClick={removeSelectedChord}>{t('arrangement.removeChord')}</Button>
            </div>
          ) : null}
        </div> : null}
      </div>

      {mode === 'chords' ? <details className="border-t border-border-subtle px-5 py-3">
        <summary className="cursor-pointer text-sm font-medium text-muted hover:text-ink">{t('arrangement.advancedChordSource')}</summary>
        <textarea
          className="mt-3 max-h-64 min-h-36 w-full resize-y rounded-lg border border-border-subtle bg-surface-hover p-3 font-mono text-xs leading-5 text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary"
          rows={8}
          value={chords}
          onChange={(event) => onChordsChange(event.target.value)}
          data-testid="arrangement-chords"
          spellCheck={false}
        />
      </details> : null}
    </section>
  )
}
