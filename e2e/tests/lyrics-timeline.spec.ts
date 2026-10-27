import { expect, test } from '@playwright/test'
import { activeChordLineIndex, activeChordLineIndexes, activeChordWordLineIndexes, chordWordPresentation, parseChordTimingTimeline, serializeChordTimingTimeline } from '../../web/apps/app/src/repertoire/chordTiming'
import { parseStageDisplayMessage } from '../../web/apps/app/src/repertoire/stageDisplaySync'

test('lyric line ends survive editing and stop highlighting during silence', () => {
  const timeline = parseChordTimingTimeline('[{"lineIndex":0,"atMs":1000,"endMs":4000},{"lineIndex":1,"atMs":2000,"endMs":2500}]')
  expect(activeChordLineIndex(timeline.lineMarks, 2600)).toBe(0)
  expect(activeChordLineIndex(timeline.lineMarks, 4000)).toBeNull()
  expect(JSON.parse(serializeChordTimingTimeline(timeline))[0].endMs).toBe(4000)
})

test('parallel vocals fill independently and completed words do not cross vocal lines', () => {
  const marks = [{ lineIndex: 0, wordIndex: 0, startMs: 1000, endMs: 3000 }, { lineIndex: 1, wordIndex: 0, startMs: 1500, endMs: 2500 }]
  expect(chordWordPresentation(marks, 2000).active).toEqual([{ lineIndex: 0, wordIndex: 0, progress: 0.5 }, { lineIndex: 1, wordIndex: 0, progress: 0.5 }])
  expect(chordWordPresentation(marks, 2600).completed).toEqual([{ lineIndex: 1, wordIndex: 0 }])
  expect(activeChordLineIndexes([{ lineIndex: 0, atMs: 1000, endMs: 3000 }, { lineIndex: 1, atMs: 1500, endMs: 2500 }], 2000)).toEqual([0, 1])
})

test('parallel vocals retain their own completed word during the same lyric moment', () => {
  const marks = [
    { lineIndex: 0, wordIndex: 0, startMs: 1000, endMs: 1800 },
    { lineIndex: 0, wordIndex: 1, startMs: 1900, endMs: 2700 },
    { lineIndex: 1, wordIndex: 0, startMs: 1000, endMs: 2300 },
    { lineIndex: 1, wordIndex: 1, startMs: 2400, endMs: 3200 },
  ]

  expect(chordWordPresentation(marks, 2800).completed).toEqual([
    { lineIndex: 0, wordIndex: 1 },
    { lineIndex: 1, wordIndex: 0 },
  ])
})

test('word-timed lines remain focused through the gap until the next lyric line starts', () => {
  const marks = [
    { lineIndex: 0, wordIndex: 0, startMs: 1000, endMs: 1800 },
    { lineIndex: 0, wordIndex: 1, startMs: 2000, endMs: 2800 },
    { lineIndex: 1, wordIndex: 0, startMs: 3500, endMs: 4200 },
  ]

  expect(activeChordWordLineIndexes(marks, 1900)).toEqual([0])
  expect(activeChordWordLineIndexes(marks, 500)).toEqual([])
  expect(activeChordWordLineIndexes(marks, 3000)).toEqual([0])
  expect(activeChordWordLineIndexes(marks, 3500)).toEqual([1])
  expect(activeChordWordLineIndexes(marks, 4300)).toEqual([])
  expect(activeChordWordLineIndexes(marks, 3000, [{ lineIndex: 0, atMs: 1000, endMs: 2800 }])).toEqual([])
})

test('overlapping word-timed vocal lines remain active independently', () => {
  const marks = [
    { lineIndex: 0, wordIndex: 0, startMs: 1000, endMs: 4000 },
    { lineIndex: 1, wordIndex: 0, startMs: 2500, endMs: 4500 },
  ]

  expect(activeChordWordLineIndexes(marks, 3000)).toEqual([0, 1])
  expect(activeChordWordLineIndexes(marks, 4200)).toEqual([1])
})

test('secondary display rejects malformed parallel-word presentation messages', () => {
  const sessionId = '00000000-0000-0000-0000-000000000001'
  const state = { activeIndex: 0, activeIndexes: [0], wordFocus: null, wordFocuses: [{ lineIndex: 0, wordIndex: 0, progress: 0.5 }], completedWords: [], completedWord: null, instrumentalProgress: null, autoFollow: true, cursor: 0, fontSize: 44, scrolling: false, showChords: false, speed: 30 }
  expect(parseStageDisplayMessage({ type: 'state', sessionId, state }, sessionId)).not.toBeNull()
  expect(parseStageDisplayMessage({ type: 'state', sessionId, state: { ...state, wordFocuses: [{ lineIndex: 0, wordIndex: 0, progress: 2 }] } }, sessionId)).toBeNull()
})
