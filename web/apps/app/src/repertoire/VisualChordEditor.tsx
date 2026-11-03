import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { Pencil, SkipBack, SkipForward, Undo2 } from 'lucide-react'
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'
import { FileDropzone } from '../ui/FileDropzone'
import { useT } from '../i18n'
import { PracticePlayer } from './PracticePlayer'
import { WordTimingDialog } from './WordTimingDialog'
import { useAudioPlayer } from './AudioPlayerContext'
import { chordSuggestionsForKey, looksLikeChordPro, transposeChordPro } from './chordPro'
import { chordDegreeInKey, chordNotes } from './chordSymbols'
import { ChordDiagramCard } from './ChordDiagramCard'
import { ChordProSourceEditor } from './ChordProSourceEditor'
import { ChordProView } from './ChordProView'
import { HarmonyComposer } from './HarmonyComposer'
import { composeChordPro, rewriteVerse, varyProgression } from './composeChordPro'
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
  activeChordWord,
  clearChordTimingMark,
  formatChordTimestamp as formatTimestamp,
  nudgeChordWordTiming,
  parseChordTimestamp as parseTimestamp,
  splitChordProLines,
  type ChordTimingTimeline,
} from './chordTiming'
import type { PracticeAudioSource } from './pickPracticeAudio'

export type ArrangementEditorMode = 'lyrics' | 'chords'

type VisualChordEditorProps = {
  lyrics: string
  chords: string
  onLyricsChange: (value: string) => void
  onChordsChange: (value: string) => void
  timingTimeline: ChordTimingTimeline
  onTimingChange: (value: ChordTimingTimeline) => void
  groupId: string
  userId: string
  songId: string
  arrangementId: string
  practiceUrl: string
  artist?: string
  arrangementLabel: string
  defaultKey: string
  defaultBpm: number | null
  harmonyJson: string | null
  onHarmonyJsonChange: (value: string) => void
  onDefaultKeyChange: (value: string) => void
  onDefaultBpmChange: (value: number) => void
  onBack: () => void
  audioTracks: PracticeAudioSource[]
  importFile: File | null
  importError: boolean
  onImportFileChange: (file: File | null) => void
  mode: ArrangementEditorMode
  editorTitle: string
  additionalLyricsImport?: ReactNode
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
  userId,
  songId,
  arrangementId,
  practiceUrl,
  artist,
  arrangementLabel,
  defaultKey,
  defaultBpm,
  harmonyJson,
  onHarmonyJsonChange,
  onDefaultKeyChange,
  onDefaultBpmChange,
  onBack,
  audioTracks,
  importFile,
  importError,
  onImportFileChange,
  mode,
  editorTitle,
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
  const [composeGenre, setComposeGenre] = useState('pop')
  const [composeKey, setComposeKey] = useState(defaultKey || 'C')
  const [composeIdea, setComposeIdea] = useState('')
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
  const [selectedWordIndex, setSelectedWordIndex] = useState(0)
  const [wordMarkingMode, setWordMarkingMode] = useState(false)
  const [timingHistory, setTimingHistory] = useState<ChordTimingTimeline[]>([])
  const [wordTimingOpen, setWordTimingOpen] = useState(false)
  const [shiftDraft, setShiftDraft] = useState('')
  const [transposeDraft, setTransposeDraft] = useState('')
  const sheetRef = useRef<HTMLDivElement>(null)

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
  const composeBrief = { genre: composeGenre, key: composeKey, idea: composeIdea }
  const suggestedChordsWithDegree = suggestedChords.map((chord) => ({ chord, degree: chordDegreeInKey(chord, defaultKey) }))
  const selectedChordNotes = selectedChord ? chordNotes(selectedChord) : []
  const timingMarks = timingTimeline.lineMarks
  const timeByLine = new Map(timingMarks.map((mark) => [mark.lineIndex, mark.atMs]))
  const timeByWord = new Map(timingTimeline.wordMarks.map((mark) => [`${mark.lineIndex}:${mark.wordIndex}`, mark]))
  const activeLine = activeChordLineIndex(timingMarks, currentAudioMs)
  const activeWord = activeChordWord(timingTimeline.wordMarks, currentAudioMs)
  const lineCount = Math.max(document.lines.length, splitChordProLines(chords).length)
  const selectedLine = document.lines[selectedLineIndex]
  const selectedLineWords = selectedLine?.slots.filter((slot) => slot.text.trim()).map((slot) => slot.text) ?? []
  const selectedWordIndexForLine = Math.min(selectedWordIndex, Math.max(0, selectedLineWords.length - 1))
  const selectedWordText = selectedLineWords[selectedWordIndexForLine] ?? ''
  const selectedWordTiming = selectedWordText ? timeByWord.get(`${selectedLineIndex}:${selectedWordIndexForLine}`) : undefined
  const selectedLineMark = timingTimeline.lineMarks.find((mark) => mark.lineIndex === selectedLineIndex)
  const selectedLineText = selectedLineWords.join(' ')

  function selectLine(lineIndex: number, wordIndex = 0) {
    setSelectedLineIndex(lineIndex)
    setSelectedWordIndex(wordIndex)
    sheetRef.current?.focus({ preventScroll: true })
  }

  // Karaoke follow: keep the singing line inside the sheet while the audio plays.
  useEffect(() => {
    if (activeLine == null || !Number.isFinite(activeLine) || activeLine < 0) return
    const container = sheetRef.current
    const target = container?.querySelector(`[data-testid="digitizer-line-${activeLine}"]`)
    if (!container || !(target instanceof HTMLElement)) return
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    if (targetRect.top < containerRect.top || targetRect.bottom > containerRect.bottom) {
      container.scrollTop += targetRect.top - containerRect.top - 8
    }
  }, [activeLine])

  /** lrc-maker style timing hotkeys, scoped to the song sheet. */
  function handleSheetKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (mode !== 'lyrics') return
    const target = event.target as HTMLElement
    if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(target.tagName) || target.isContentEditable) return

    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      if (wordMarkingMode && selectedLineWords.length > 0) {
        markSelectedWord()
        return
      }
      if (!audioTracks.length) {
        beginTimeEdit(selectedLineIndex)
        return
      }
      const atMs = Math.max(0, Math.round(audioPlayer.getCurrentTime() * 1000))
      setCurrentAudioMs(atMs)
      updateTiming(selectedLineIndex, atMs)
      setSelectedLineIndex((index) => Math.min(index + 1, Math.max(0, lineCount - 1)))
      setSelectedWordIndex(0)
      return
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      if (wordMarkingMode && selectedWordTiming) {
        clearWord(selectedLineIndex, selectedWordIndexForLine)
        setSelectedWordIndex((index) => Math.max(0, index - 1))
      } else {
        updateTiming(selectedLineIndex, null)
      }
      return
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      if (audioTracks.length) audioPlayer.togglePlay()
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (!audioTracks.length) return
      event.preventDefault()
      const next = Math.max(0, audioPlayer.getCurrentTime() + (event.key === 'ArrowLeft' ? -0.2 : 0.2))
      audioPlayer.seek(next)
      setCurrentAudioMs(Math.round(next * 1000))
      return
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      if (wordMarkingMode && event.altKey && selectedLineWords.length > 0) {
        setSelectedWordIndex((index) => Math.max(0, Math.min(index + (event.key === 'ArrowUp' ? -1 : 1), selectedLineWords.length - 1)))
        return
      }
      setSelectedLineIndex((index) => Math.max(0, Math.min(index + (event.key === 'ArrowUp' ? -1 : 1), Math.max(0, lineCount - 1))))
      setSelectedWordIndex(0)
    }
  }

  const shiftMs = Math.round(Number(shiftDraft)) || 0
  const transposeSemitones = Math.max(-11, Math.min(11, Math.trunc(Number(transposeDraft) || 0)))

  function applyTranspose() {
    if (!transposeSemitones) return
    onChordsChange(transposeChordPro(chords, transposeSemitones))
    setTransposeDraft('')
  }
  const sortedMarks = [...timingMarks].sort((a, b) => a.atMs - b.atMs || a.lineIndex - b.lineIndex)

  function applyShift() {
    if (shiftMs === 0) return
    pushTimingHistory()
    onTimingChange({
      ...timingTimeline,
      lineMarks: timingTimeline.lineMarks.map((mark) => ({
        ...mark,
        atMs: Math.max(0, mark.atMs + shiftMs),
        ...(mark.endMs !== undefined ? { endMs: Math.max(0, mark.endMs + shiftMs) } : {}),
      })),
      wordMarks: timingTimeline.wordMarks.map((mark) => ({
        ...mark,
        startMs: Math.max(0, mark.startMs + shiftMs),
        endMs: Math.max(0, mark.endMs + shiftMs),
      })),
      instrumentals: timingTimeline.instrumentals.map((interval) => ({
        ...interval,
        startMs: Math.max(0, interval.startMs + shiftMs),
        endMs: Math.max(0, interval.endMs + shiftMs),
      })),
    })
    setShiftDraft('')
  }

  const diagramChords = Array.from(new Set([...palette, ...suggestedChords])).slice(0, 12)

  function lineMarksWithStart(lineIndex: number, atMs: number) {
    const existing = timingTimeline.lineMarks.find((mark) => mark.lineIndex === lineIndex)
    const mark = {
      lineIndex,
      atMs,
      ...(existing?.endMs != null && existing.endMs > atMs ? { endMs: existing.endMs } : {}),
    }
    return [...timingTimeline.lineMarks.filter((item) => item.lineIndex !== lineIndex), mark]
      .sort((left, right) => left.atMs - right.atMs || left.lineIndex - right.lineIndex)
  }

  function pushTimingHistory() {
    setTimingHistory((history) => [...history.slice(-19), timingTimeline])
  }

  function updateTiming(lineIndex: number, atMs: number | null) {
    const next = atMs == null
      ? clearChordTimingMark(timingMarks, lineIndex)
      : lineMarksWithStart(lineIndex, atMs)
    onLyricsChange(lyricsDraft)
    onChordsChange(serializeKeepingDirectives(document, chords))
    pushTimingHistory()
    onTimingChange({ ...timingTimeline, lineMarks: next })
  }

  function markLineEnd(lineIndex: number, endMs: number) {
    const mark = timingTimeline.lineMarks.find((item) => item.lineIndex === lineIndex)
    if (!mark || endMs <= mark.atMs) return false
    pushTimingHistory()
    onTimingChange({
      ...timingTimeline,
      lineMarks: timingTimeline.lineMarks.map((item) => item.lineIndex === lineIndex ? { ...item, endMs } : item),
    })
    return true
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
    pushTimingHistory()
    onTimingChange({
      ...timingTimeline,
      lineMarks: lineMarksWithStart(lineIndex, startMs),
      wordMarks: nextMarks,
    })
  }

  function markSelectedWord() {
    if (!selectedLineWords.length) return
    markWord(selectedLineIndex, selectedWordIndexForLine)
    const nextWord = selectedLineWords.findIndex((_, index) => index > selectedWordIndexForLine && !timeByWord.has(`${selectedLineIndex}:${index}`))
    if (nextWord >= 0) {
      setSelectedWordIndex(nextWord)
    } else if (selectedLineIndex < lineCount - 1) {
      setSelectedLineIndex(selectedLineIndex + 1)
      setSelectedWordIndex(0)
    }
  }

  function undoTiming() {
    const previous = timingHistory.at(-1)
    if (!previous) return
    onTimingChange(previous)
    setTimingHistory((history) => history.slice(0, -1))
  }

  function updateWordTimes(lineIndex: number, wordIndex: number, startMs: number, endMs: number): boolean {
    const sameLine = timingTimeline.wordMarks.filter(item => item.lineIndex === lineIndex && item.wordIndex !== wordIndex)
    const previous = sameLine.filter(item => item.wordIndex < wordIndex).sort((left, right) => right.wordIndex - left.wordIndex)[0]
    const next = sameLine.filter(item => item.wordIndex > wordIndex).sort((left, right) => left.wordIndex - right.wordIndex)[0]
    if (endMs <= startMs || (previous && startMs < previous.endMs) || (next && endMs > next.startMs)) {
      return false
    }
    pushTimingHistory()
    onTimingChange({
      ...timingTimeline,
      wordMarks: timingTimeline.wordMarks.map(item => item.lineIndex === lineIndex && item.wordIndex === wordIndex
        ? { ...item, startMs, endMs }
        : item),
    })
    return true
  }

  function nudgeWord(lineIndex: number, wordIndex: number, deltaMs: number) {
    pushTimingHistory()
    onTimingChange({
      ...timingTimeline,
      wordMarks: nudgeChordWordTiming(timingTimeline.wordMarks, lineIndex, wordIndex, deltaMs),
    })
  }

  function clearWord(lineIndex: number, wordIndex: number) {
    pushTimingHistory()
    onTimingChange({
      ...timingTimeline,
      wordMarks: timingTimeline.wordMarks.filter((mark) => mark.lineIndex !== lineIndex || mark.wordIndex !== wordIndex),
    })
  }

  function closeCurrentWord() {
    const audioMs = Math.max(0, Math.round(audioPlayer.getCurrentTime() * 1000))
    const active = timingTimeline.wordMarks.find((mark) => mark.startMs < audioMs && mark.endMs > audioMs)
    if (!active) return
    pushTimingHistory()
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
      pushTimingHistory()
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
    <section className={mode === 'chords' ? 'w-full bg-canvas' : 'overflow-hidden rounded-2xl border border-border-subtle bg-surface'} aria-label={editorTitle} data-testid="chordpro-digitizer" data-visual-editor="true">
      {mode === 'chords' ? <HarmonyComposer
        value={harmonyJson}
        keySignature={defaultKey || 'C'}
        bpm={defaultBpm}
        onChange={onHarmonyJsonChange}
        onKeyChange={onDefaultKeyChange}
        onBpmChange={onDefaultBpmChange}
        onBack={onBack}
      /> : null}
      {mode === 'chords' ? <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle bg-surface-hover px-5 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-1.5">
            <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-sm font-extrabold text-on-primary">{defaultKey?.trim().match(/^[A-G][#b]?/)?.[0] ?? '♪'}</span>
            <span className="text-sm font-bold text-ink">{defaultKey ?? t('arrangement.editorTitleChords')}</span>
          </div>
          <label className="sr-only" htmlFor="chord-transpose-input">{t('arrangement.transposeSemitones')}</label>
          <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-1.5">
            <input id="chord-transpose-input" type="number" min={-11} max={11} step={1} inputMode="numeric" className="h-9 w-16 rounded-md bg-surface-hover px-2 text-center text-sm font-semibold text-ink" value={transposeDraft} onChange={(event) => setTransposeDraft(event.target.value)} data-testid="chord-transpose-input" />
            <span className="text-xs font-medium text-muted">{t('arrangement.transposeSemitones')}</span>
            <Button type="button" variant="secondary" size="sm" onClick={applyTranspose} disabled={transposeSemitones === 0} data-testid="chord-transpose-apply">{t('arrangement.transposeApply')}</Button>
          </div>
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
      </header> : null}

      <div className={`grid gap-5 p-4 sm:p-6 ${mode === 'lyrics' ? 'grid-cols-1 lg:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.5fr)]' : 'xl:grid-cols-[minmax(15rem,0.72fr)_minmax(0,1.8fr)]'}`}>
        <div className={`${mode === 'lyrics' ? 'contents' : 'min-w-0 w-full space-y-5'}`}>
          {mode === 'lyrics' ? <div className="order-3 min-w-0 space-y-3 lg:col-span-2">
            <details className="rounded-xl border border-border-subtle bg-surface-hover p-4" open={!lyricsDraft.trim()}>
              <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">{t('arrangement.editLyricsText')}</summary>
              <div className="mt-3 space-y-3">
                <label className="block space-y-2">
                  <span className="sr-only">{t('arrangement.lyricsOptional')}</span>
                  <textarea
                    className={`${fieldClass} min-h-48 resize-y font-sans text-base leading-8`}
                    rows={6}
                    value={lyricsDraft}
                    onChange={(event) => editLyrics(event.target.value)}
                    spellCheck
                    data-testid="digitizer-lyrics"
                  />
                </label>
                <p className="text-sm leading-6 text-muted">{t('arrangement.visualLyricsHelp')}</p>
              </div>
            </details>
            {additionalLyricsImport}
          </div> : null}

          {mode === 'chords' ? <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-hover p-4">
              <p className="text-sm font-semibold text-ink">{t('arrangement.chordProSourceHeading')}</p>
              <ChordProSourceEditor
                value={chords}
                onChange={onChordsChange}
                defaultKey={defaultKey}
                testId="arrangement-chords"
                ariaLabel={t('arrangement.chordProSourceHeading')}
              />
            </div>
            <details className="rounded-xl border border-border-subtle bg-surface p-4" data-testid="chordpro-compose">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">{t('arrangement.composeTitle')}</summary>
              <div className="mt-3 space-y-4">
                <p className="text-sm text-muted">{t('arrangement.composeHint')}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-2 text-sm font-medium text-ink">
                    <span>{t('arrangement.genreLabel')}</span>
                    <input className={fieldClass} value={composeGenre} onChange={(event) => setComposeGenre(event.target.value)} data-testid="compose-genre" maxLength={64} />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-ink">
                    <span>{t('arrangement.keyFieldLabel')}</span>
                    <input className={fieldClass} value={composeKey} onChange={(event) => setComposeKey(event.target.value)} data-testid="compose-key" maxLength={16} />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-ink">
                    <span>{t('arrangement.ideaLabel')}</span>
                    <input className={fieldClass} value={composeIdea} onChange={(event) => setComposeIdea(event.target.value)} data-testid="compose-idea" maxLength={200} />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => onChordsChange(composeChordPro(composeBrief))} data-testid="compose-generate">{t('arrangement.generateSong')}</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => onChordsChange(varyProgression(chords, composeBrief))} data-testid="compose-vary-progression" disabled={!chords.includes('{start_of_')}>{t('arrangement.varyProgression')}</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => onChordsChange(rewriteVerse(chords, composeBrief))} data-testid="compose-rewrite-verse" disabled={!chords.includes('{start_of_verse}')}>{t('arrangement.rewriteVerse')}</Button>
                </div>
                {chords.trim() ? <div className="space-y-2 pt-1">
                  <p className="text-sm font-medium text-ink">{t('arrangement.previewLabel')}</p>
                  {looksLikeChordPro(chords) ? (
                    <ChordProView text={chords} testId="chords-preview" className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[var(--color-score-border)] bg-[var(--color-score-paper)] p-3 font-sans" />
                  ) : (
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--color-score-border)] bg-[var(--color-score-paper)] p-3 font-sans text-sm text-[var(--color-score-ink)]" data-testid="chords-preview">{chords}</pre>
                  )}
                </div> : null}
              </div>
            </details>
            <details className="rounded-xl border border-border-subtle bg-surface-hover p-4">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">{t('arrangement.importLabel')}</summary>
              <div className="mt-3 space-y-3">
                <FileDropzone
                  title={t('arrangement.importLabel')}
                  description={t('arrangement.importHint')}
                  accept=".cho,.chordpro,.chord,.crd,.txt,text/plain"
                  file={importFile}
                  onFileChange={onImportFileChange}
                  testId="arrangement-chords-import"
                  compact
                />
                {importError ? <p className="text-sm text-error-ink" role="alert">{t('arrangement.importError')}</p> : null}
              </div>
            </details>
            <details className="rounded-xl border border-border-subtle bg-surface-hover p-4">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">{t('arrangement.chordPalette')}</summary>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
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
              <p className="mt-3 text-sm leading-6 text-muted">{t('arrangement.distributeChordHint')}</p>
              {palette.length > 0 ? (
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
              ) : null}
            </details>
            {suggestedChords.length > 0 ? (
              <div className="space-y-2" aria-label={t('arrangement.keyChordSuggestions', { key: defaultKey })}>
                <div>
                  <p className="text-sm font-semibold text-ink">{t('arrangement.keyChordSuggestions', { key: defaultKey })}</p>
                  <p className="text-xs text-muted">{t('arrangement.keyChordSuggestionsHint')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestedChordsWithDegree.map(({ chord, degree }) => (
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
                      {degree ? <span className="ml-1 align-super text-[10px] font-normal opacity-70">{degree}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {diagramChords.length > 0 ? (
              <div className="space-y-2" aria-label={t('arrangement.chordDiagramsLabel')}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('arrangement.chordDiagramsLabel')}</p>
                <div className="flex flex-wrap gap-2">
                  {diagramChords.map((chord) => (
                    <button
                      key={chord}
                      type="button"
                      className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 transition-colors ${selectedChord === chord && !selectedCursor ? 'border-primary bg-primary/10' : 'border-border-subtle bg-surface hover:bg-surface-hover'}`}
                      aria-pressed={selectedChord === chord && !selectedCursor}
                      onClick={() => {
                        setManualChords((current) => Array.from(new Set([...current, chord])))
                        setSelectedChord(chord)
                        setSelectedCursor(null)
                      }}
                    >
                      <span className="font-mono text-xs font-semibold text-ink">{chord}</span>
                      <ChordDiagramCard chord={chord} />
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
                <span>
                  {t('arrangement.placeSelectedChordHint', { chord: selectedChord })}
                  {selectedChordNotes.length > 0 ? (
                    <span className="ms-2 text-xs opacity-70">{t('arrangement.chordNotes', { notes: selectedChordNotes.join(' · ') })}</span>
                  ) : null}
                </span>
              ) : (
                <span>{t('arrangement.visualChordHelp')}</span>
              )}
            </div>
          </div> : null}

          {mode === 'lyrics' ? <div className="order-1 min-w-0 space-y-3">
            {audioTracks.length > 0 ? <h3 className="text-sm font-semibold text-ink">{t('times.audioTitle')}</h3> : null}
            {audioTracks.length > 0 ? (
              <PracticePlayer
                groupId={groupId}
                userId={userId}
                songId={songId}
                arrangementId={arrangementId}
                practiceUrl={practiceUrl}
                artist={artist}
                lyrics={lyricsDraft}
                timingTimeline={timingTimeline}
                tracks={audioTracks}
                onCurrentTimeChange={handleAudioTime}
                compact
              />
            ) : (
              <div className="rounded-xl border border-border-subtle bg-surface-hover p-4">
                <p className="text-sm font-semibold text-ink">{t('times.audioTitle')}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{t('times.noAudioHint')}</p>
              </div>
            )}
            {lyricsDraft.trim() ? <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface-hover p-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('times.selectedLine', { line: selectedLineIndex + 1 })}</p>
                <p className="mt-1 truncate text-sm font-medium text-ink">{selectedLineText || t('arrangement.songSheetEmpty')}</p>
                <p className="mt-1 font-mono text-xs tabular-nums text-muted">{formatTimestamp(currentAudioMs)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => {
                  if (!audioTracks.length) { beginTimeEdit(selectedLineIndex); return }
                  const atMs = Math.max(0, Math.round(audioPlayer.getCurrentTime() * 1000))
                  setCurrentAudioMs(atMs)
                  updateTiming(selectedLineIndex, atMs)
                }}>
                  {t('times.markLineStart')}
                </Button>
                <Button type="button" variant="secondary" disabled={!audioTracks.length || !selectedLineMark || currentAudioMs <= selectedLineMark.atMs} onClick={() => {
                  const endMs = Math.max(0, Math.round(audioPlayer.getCurrentTime() * 1000))
                  setCurrentAudioMs(endMs)
                  markLineEnd(selectedLineIndex, endMs)
                }}>
                  {t('times.markLineEnd')}
                </Button>
              </div>
              {wordMarkingMode ? <p className="text-xs leading-5 text-muted">{t('times.wordModeHint')}</p> : null}
            </div> : null}
            {!lyricsDraft.trim() ? <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-primary-ink" role="status">{t('times.addLyricsHint')}</p> : null}
            <details className="rounded-xl border border-border-subtle bg-surface-hover p-4">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">{t('arrangement.lyricsSyncTools')}</summary>
              <div className="mt-3 space-y-4">
                {audioTracks.length > 0 ? <div className="flex flex-wrap items-center gap-3">
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
                </div> : null}
                <div>
                  <p className="text-sm font-semibold text-ink">{t('arrangement.retimerTitle')}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">{t('arrangement.retimerHint')}</p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                <label className="block space-y-2">
                  <span className="block text-xs font-semibold text-ink">{t('arrangement.retimerAmount')}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    className={`${fieldClass} w-36`}
                    value={shiftDraft}
                    onChange={(event) => setShiftDraft(event.target.value)}
                    data-testid="timing-shift-input"
                  />
                </label>
                <Button type="button" variant="secondary" onClick={applyShift} disabled={shiftMs === 0}>
                  {t('arrangement.retimerApply')}
                </Button>
                </div>
              {sortedMarks.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted">{t('arrangement.retimerPreview')}</p>
                  <ul className="space-y-0.5 font-mono text-xs text-muted">
                    {sortedMarks.slice(0, 5).map((mark) => (
                      <li key={mark.lineIndex}>
                        {String(mark.lineIndex + 1).padStart(2, '0')} · {formatTimestamp(mark.atMs)} → {formatTimestamp(Math.max(0, mark.atMs + shiftMs))}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-muted">{t('arrangement.retimerEmpty')}</p>
              )}
                <p className="text-xs leading-5 text-muted">{t('arrangement.timesShortcutsHint')}</p>
              </div>
            </details>
            {timeError ? <p className="text-sm font-medium text-error-ink" role="alert">{t('times.invalidTimestamp')}</p> : null}
          </div> : null}
        </div>

        <div className={`order-2 min-w-0 overflow-hidden rounded-2xl border border-border-subtle bg-surface text-ink ${mode === 'lyrics' ? 'w-full' : ''}`} data-testid="digitizer-studio" data-visual-song-sheet="true">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
            <div>
              <h4 className="font-semibold">{t(mode === 'lyrics' ? 'arrangement.lyricsWorkspaceTitle' : 'arrangement.songSheetTitle')}</h4>
              <p className="mt-1 text-sm text-muted">{t(mode === 'lyrics' ? 'arrangement.lyricsWorkspaceHint' : 'arrangement.songSheetHint')}</p>
            </div>
            <span className="rounded-full bg-surface-hover px-3 py-1 text-xs font-semibold text-ink" aria-live="off">
              {formatTimestamp(currentAudioMs)}
            </span>
          </div>
          {mode === 'lyrics' ? <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface-hover px-4 py-3 sm:px-6" data-testid="lrc-editor-controls">
            <Button type="button" size="sm" variant={wordMarkingMode ? 'secondary' : 'primary'} aria-pressed={!wordMarkingMode} onClick={() => setWordMarkingMode(false)}>{t('times.lineMode')}</Button>
            <Button type="button" size="sm" variant={wordMarkingMode ? 'primary' : 'secondary'} aria-pressed={wordMarkingMode} onClick={() => setWordMarkingMode(true)}>{t('times.wordMode')}</Button>
            <span className="hidden min-w-0 flex-1 truncate text-sm text-muted sm:block">{t('times.selectedLine', { line: selectedLineIndex + 1 })} · {selectedWordText || selectedLineText}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => selectLine(Math.max(0, selectedLineIndex - 1))} disabled={selectedLineIndex === 0} aria-label={t('times.previousLine')}><SkipBack className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('times.previousLine')}</span></Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => selectLine(Math.min(lineCount - 1, selectedLineIndex + 1))} disabled={selectedLineIndex >= lineCount - 1} aria-label={t('times.nextLine')}><SkipForward className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('times.nextLine')}</span></Button>
            <Button type="button" size="sm" variant="ghost" onClick={undoTiming} disabled={!timingHistory.length} aria-label={t('times.undoTiming')}><Undo2 className="h-4 w-4" aria-hidden="true" />{t('times.undoTiming')}</Button>
          </div> : null}
          <div ref={sheetRef} className="min-h-56 divide-y divide-border-subtle px-4 sm:px-6 xl:max-h-[min(62vh,42rem)] xl:overflow-y-auto xl:overscroll-contain" role="region" aria-label={t('arrangement.songSheetTitle')} tabIndex={0} onKeyDown={handleSheetKeyDown} data-testid="digitizer-sheet-region">
            {(lyricsDraft.trim() || timingMarks.length > 0 || timingTimeline.wordMarks.length > 0) ? sheetLines.map(({ line, lineIndex }) => {
              const markedAtMs = timeByLine.get(lineIndex)
              const isActiveLine = activeLine === lineIndex
              const isSelectedLine = mode === 'lyrics' && selectedLineIndex === lineIndex

              if (mode === 'lyrics') {
                let wordIndex = 0
                return (
                  <article
                    key={lineIndex}
                    data-testid={`digitizer-line-${lineIndex}`}
                    data-selected={isSelectedLine}
                    aria-current={isActiveLine ? 'true' : undefined}
                    onClick={(event) => {
                      const target = event.target as HTMLElement
                      if (!target.closest('[data-line-control], button, input')) selectLine(lineIndex)
                    }}
                    className={`space-y-3 rounded-2xl border px-4 py-3 transition-colors ${isSelectedLine ? 'border-primary/30 bg-primary/5' : 'border-transparent hover:bg-surface-hover/50'} ${isActiveLine ? 'bg-primary/[0.04]' : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-3" data-line-control>
                      <button
                        type="button"
                        className={`grid min-h-10 min-w-10 place-items-center rounded-xl font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${isSelectedLine ? 'bg-primary/10 font-bold text-primary-ink' : 'text-muted'}`}
                        aria-label={t('times.selectLine', { line: lineIndex + 1 })}
                        aria-pressed={isSelectedLine}
                        data-testid={`digitizer-select-line-${lineIndex}`}
                        onClick={() => selectLine(lineIndex)}
                      >
                        {String(lineIndex + 1).padStart(2, '0')}
                      </button>
                      {editingTimeLine === lineIndex ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className="min-h-10 w-24 rounded-lg border border-border-subtle bg-surface px-2 font-mono text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                        </div>
                      ) : (
                        <span className={`min-w-16 rounded-lg px-2.5 py-1.5 text-center font-mono text-xs font-semibold tabular-nums ${markedAtMs != null ? 'bg-surface-hover text-ink' : 'bg-surface-hover text-muted'}`}>
                          {markedAtMs != null ? `${formatTimestamp(markedAtMs)}${timingTimeline.lineMarks.find((item) => item.lineIndex === lineIndex)?.endMs != null ? `–${formatTimestamp(timingTimeline.lineMarks.find((item) => item.lineIndex === lineIndex)?.endMs ?? markedAtMs)}` : ''}` : t('times.notMarked')}
                        </span>
                      )}
                      <div className="ms-auto flex flex-wrap items-center gap-1" data-line-control>
                        {isSelectedLine && editingTimeLine !== lineIndex ? <>
                          <Button
                            type="button"
                            variant={markedAtMs == null ? 'primary' : 'ghost'}
                            size="sm"
                            onClick={() => {
                              if (!audioTracks.length) {
                                beginTimeEdit(lineIndex)
                                return
                              }
                              const atMs = Math.max(0, Math.round(audioPlayer.getCurrentTime() * 1000))
                              setCurrentAudioMs(atMs)
                              updateTiming(lineIndex, atMs)
                            }}
                          >
                            {audioTracks.length ? t(markedAtMs != null ? 'times.replaceMark' : 'times.markCurrentTime') : t('times.addTime')}
                          </Button>
                          {markedAtMs != null ? <>
                            <Button type="button" variant="ghost" size="sm" onClick={() => beginTimeEdit(lineIndex)}>{t('times.editTime')}</Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => updateTiming(lineIndex, null)}>{t('times.clear')}</Button>
                          </> : null}
                        </> : null}
                      </div>
                    </div>

                    <div className="flex min-h-10 min-w-0 flex-wrap items-center gap-x-2 gap-y-2 pl-1 sm:pl-[3.25rem]">
                      {line.slots.map((slot, slotIndex) => {
                        const isMoving = selectedCursor?.lineIndex === lineIndex && selectedCursor.slotIndex === slotIndex
                        if (!slot.text.trim()) return slot.chord ? <span key={`${lineIndex}-${slotIndex}`} className="rounded-md px-1.5 py-0.5 text-xs font-bold text-primary-ink">{slot.chord}</span> : null
                        const currentWordIndex = wordIndex++
                        const wordTiming = timeByWord.get(`${lineIndex}:${currentWordIndex}`)
                        const isSelectedWord = isSelectedLine && selectedWordIndexForLine === currentWordIndex
                        const isActiveWord = activeWord?.lineIndex === lineIndex && activeWord.wordIndex === currentWordIndex
                        return (
                          <span key={`${lineIndex}-${slotIndex}`} className="inline-flex flex-col items-start">
                            {slot.chord ? <span className="px-1.5 text-[11px] font-bold text-primary-ink">{slot.chord}</span> : null}
                            <button
                              type="button"
                              className={`rounded-lg px-2 py-1.5 text-left text-base leading-6 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${isSelectedWord ? 'bg-primary/10 text-primary-ink ring-1 ring-primary/25' : isActiveWord ? 'bg-primary/15 font-semibold text-primary-ink' : 'text-ink hover:bg-surface-hover'}`}
                              aria-pressed={isSelectedWord}
                              onClick={(event) => {
                                event.stopPropagation()
                                selectLine(lineIndex, currentWordIndex)
                              }}
                            >
                              {slot.text}
                            </button>
                            {wordTiming ? <span className="px-2 pt-0.5 font-mono text-[11px] tabular-nums text-muted">{formatTimestamp(wordTiming.startMs)}–{formatTimestamp(wordTiming.endMs)}</span> : null}
                          </span>
                        )
                      })}
                    </div>

                    {isSelectedLine && selectedWordText && (audioTracks.length > 0 || selectedWordTiming) ? (
                      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-hover px-3 py-2.5 sm:ml-[3.25rem]" data-line-control>
                        <span className="min-w-20 text-sm font-semibold text-ink">{selectedWordText}</span>
                        {selectedWordTiming ? <>
                          <span className="font-mono text-xs tabular-nums text-muted">{formatTimestamp(selectedWordTiming.startMs)}–{formatTimestamp(selectedWordTiming.endMs)}</span>
                          <Button type="button" variant="secondary" size="sm" onClick={() => setWordTimingOpen(true)} aria-label={t('times.editWord')}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />{t('times.editWord')}
                          </Button>
                        </> : <button
                          type="button"
                          className="min-h-10 rounded-lg bg-primary/10 px-3 text-xs font-semibold text-primary-ink transition-colors hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          onClick={() => markWord(selectedLineIndex, selectedWordIndexForLine)}
                          aria-label={t('times.markWord', { word: selectedWordText })}
                        >{t('times.markWordShort')}</button>}
                      </div>
                    ) : null}
                  </article>
                )
              }

              return (
                <div key={lineIndex} data-testid={`digitizer-line-${lineIndex}`} className={`flex flex-col gap-3 rounded-2xl px-3 py-4 xl:flex-row xl:items-center xl:gap-5 ${isActiveLine ? '-mx-4 px-4 xl:-mx-6 xl:px-6' : ''}`} aria-current={isActiveLine ? 'true' : undefined}>
                  <span className="w-8 shrink-0 font-mono text-sm text-muted">{String(lineIndex + 1).padStart(2, '0')}</span>
                  <div className="flex min-h-10 min-w-0 flex-1 flex-wrap items-end gap-x-1 gap-y-3">
                    {line.slots.map((slot, slotIndex) => {
                      const cursor = cursors.find((item) => item.lineIndex === lineIndex && item.slotIndex === slotIndex)
                      const isMoving = selectedCursor?.lineIndex === lineIndex && selectedCursor.slotIndex === slotIndex
                      return (
                        <span key={`${lineIndex}-${slotIndex}`} className="inline-flex min-w-0 flex-col items-start rounded-xl px-2 py-1.5">
                          {slot.chord ? (
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
                          ) : <span className="mb-0.5 h-5" aria-hidden="true" />}
                          {slot.text ? selectedChord || selectedCursor ? (
                            <button
                              type="button"
                              className="rounded-md px-1.5 py-1 text-left text-base leading-6 text-ink transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                              aria-label={t('arrangement.placeChordOnWord', { chord: selectedCursor ? t('arrangement.moveSelectedChord') : selectedChord ?? t('arrangement.noChordSelected'), word: slot.text })}
                              onClick={() => placeChord(lineIndex, slotIndex)}
                            >
                              {slot.text}
                            </button>
                          ) : <span className="px-1.5 py-1 text-base leading-6">{slot.text}</span> : null}
                        </span>
                      )
                    })}
                  </div>
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
        </div>
      </div>
      {selectedWordTiming ? <WordTimingDialog
        open={wordTimingOpen}
        onClose={() => setWordTimingOpen(false)}
        word={selectedWordText}
        startMs={selectedWordTiming.startMs}
        endMs={selectedWordTiming.endMs}
        durationMs={Math.round(audioPlayer.duration * 1000)}
        currentMs={currentAudioMs}
        onSave={(startMs, endMs, word) => {
          if (!updateWordTimes(selectedLineIndex, selectedWordIndexForLine, startMs, endMs)) return false
          if (word !== selectedWordText) {
            const lines = normalizeLines(lyricsDraft)
            const words = selectedLineWords.slice()
            words[selectedWordIndexForLine] = word
            lines[selectedLineIndex] = words.join(' ')
            editLyrics(lines.join('\n'))
          }
          return true
        }}
        onNudge={(deltaMs) => nudgeWord(selectedLineIndex, selectedWordIndexForLine, deltaMs)}
        onRemove={() => clearWord(selectedLineIndex, selectedWordIndexForLine)}
        onListen={(startMs) => {
          audioPlayer.seek(startMs / 1000)
          if (!audioPlayer.isPlaying) audioPlayer.togglePlay()
        }}
      /> : null}
    </section>
  )
}
