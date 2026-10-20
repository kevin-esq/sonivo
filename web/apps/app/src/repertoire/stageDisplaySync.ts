export type StageDisplayState = {
  activeIndex: number | null
  wordFocus: { lineIndex: number; wordIndex: number; progress: number } | null
  completedWord: { lineIndex: number; wordIndex: number } | null
  instrumentalProgress: number | null
  autoFollow: boolean
  cursor: number
  fontSize: number
  scrolling: boolean
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
    !(instrumentalProgress === null || (typeof instrumentalProgress === 'number' && Number.isFinite(instrumentalProgress) && instrumentalProgress >= 0 && instrumentalProgress <= 1)) ||
    !validIndex(candidate.cursor) ||
    typeof candidate.autoFollow !== 'boolean' ||
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
      wordFocus: wordFocus as StageDisplayState['wordFocus'],
      completedWord: completedWord as StageDisplayState['completedWord'],
      instrumentalProgress: instrumentalProgress as number | null,
      autoFollow: candidate.autoFollow,
      cursor: candidate.cursor as number,
      fontSize: candidate.fontSize,
      scrolling: candidate.scrolling,
      showChords: candidate.showChords,
      speed: candidate.speed,
    },
  }
}
