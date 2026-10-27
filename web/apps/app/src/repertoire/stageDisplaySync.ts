export type StageDisplayState = {
  activeIndex: number | null
  wordFocus: { lineIndex: number; wordIndex: number; progress: number } | null
  activeIndexes?: number[]
  wordFocuses?: Array<{ lineIndex: number; wordIndex: number; progress: number }>
  completedWords?: Array<{ lineIndex: number; wordIndex: number }>
  completedWord: { lineIndex: number; wordIndex: number } | null
  instrumentalProgress: number | null
  autoFollow: boolean
  cursor: number
  fontSize: number
  scrolling: boolean
  showLyrics: boolean
  showChords: boolean
  speed: number
}

export type StageDisplayMessage =
  | { type: 'ready' | 'closed'; sessionId: string }
  | { type: 'state'; sessionId: string; state: StageDisplayState }

export function stageDisplayChannelName(sessionId: string): string {
  return `sonivo:stage-display:${sessionId}`
}

export function isStageDisplaySessionId(value: string | null): value is string {
  return value != null && /^[0-9a-f-]{36}$/i.test(value)
}

export function parseStageDisplayMessage(value: unknown, sessionId: string): StageDisplayMessage | null {
  if (typeof value !== 'object' || value === null) return null
  const message = value as Record<string, unknown>
  if (message.sessionId !== sessionId || (message.type !== 'ready' && message.type !== 'closed' && message.type !== 'state')) {
    return null
  }
  if (message.type === 'ready' || message.type === 'closed') {
    return { type: message.type, sessionId }
  }

  const state = message.state
  if (typeof state !== 'object' || state === null) return null
  const candidate = state as Record<string, unknown>
  const validIndex = (index: unknown) => typeof index === 'number' && Number.isSafeInteger(index) && index >= 0
  const validWord = (entry: unknown, progress: boolean) => {
    if (typeof entry !== 'object' || entry === null) return false
    const word = entry as Record<string, unknown>
    return validIndex(word.lineIndex) && validIndex(word.wordIndex) && (!progress || (
      typeof word.progress === 'number' && Number.isFinite(word.progress) && word.progress >= 0 && word.progress <= 1
    ))
  }
  const validArray = (value: unknown, validate: (entry: unknown) => boolean) => value === undefined || (
    Array.isArray(value) && value.length <= 2000 && value.every(validate)
  )
  const wordFocus = candidate.wordFocus
  const completedWord = candidate.completedWord
  const wordProgress = typeof wordFocus === 'object' && wordFocus !== null
    ? (wordFocus as Record<string, unknown>).progress
    : null
  const validWordFocus = wordFocus === null || (
    typeof wordFocus === 'object' && wordFocus !== null &&
    validIndex((wordFocus as Record<string, unknown>).lineIndex) &&
    validIndex((wordFocus as Record<string, unknown>).wordIndex) &&
    typeof wordProgress === 'number' &&
    Number.isFinite(wordProgress) &&
    wordProgress >= 0 &&
    wordProgress <= 1
  )
  const validCompletedWord = completedWord === null || (
    typeof completedWord === 'object' && completedWord !== null &&
    validIndex((completedWord as Record<string, unknown>).lineIndex) &&
    validIndex((completedWord as Record<string, unknown>).wordIndex)
  )
  const instrumentalProgress = candidate.instrumentalProgress
  if (
    !(candidate.activeIndex === null || validIndex(candidate.activeIndex)) ||
    !validWordFocus ||
    !validCompletedWord ||
    !validArray(candidate.activeIndexes, validIndex) ||
    !validArray(candidate.wordFocuses, entry => validWord(entry, true)) ||
    !validArray(candidate.completedWords, entry => validWord(entry, false)) ||
    !(instrumentalProgress === null || (typeof instrumentalProgress === 'number' && Number.isFinite(instrumentalProgress) && instrumentalProgress >= 0 && instrumentalProgress <= 1)) ||
    !validIndex(candidate.cursor) ||
    typeof candidate.autoFollow !== 'boolean' ||
    (candidate.showLyrics !== undefined && typeof candidate.showLyrics !== 'boolean') ||
    typeof candidate.showChords !== 'boolean' ||
    typeof candidate.scrolling !== 'boolean' ||
    typeof candidate.fontSize !== 'number' || !Number.isFinite(candidate.fontSize) || candidate.fontSize < 20 || candidate.fontSize > 120 ||
    typeof candidate.speed !== 'number' || !Number.isFinite(candidate.speed) || candidate.speed < 10 || candidate.speed > 120
  ) {
    return null
  }
  return {
    type: 'state',
    sessionId,
    state: {
      activeIndex: candidate.activeIndex as number | null,
      activeIndexes: candidate.activeIndexes as StageDisplayState['activeIndexes'],
      wordFocuses: candidate.wordFocuses as StageDisplayState['wordFocuses'],
      completedWords: candidate.completedWords as StageDisplayState['completedWords'],
      wordFocus: wordFocus as StageDisplayState['wordFocus'],
      completedWord: completedWord as StageDisplayState['completedWord'],
      instrumentalProgress: instrumentalProgress as number | null,
      autoFollow: candidate.autoFollow,
      cursor: candidate.cursor as number,
      fontSize: candidate.fontSize,
      scrolling: candidate.scrolling,
      showLyrics: candidate.showLyrics !== false,
      showChords: candidate.showChords,
      speed: candidate.speed,
    },
  }
}
