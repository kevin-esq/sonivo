/** Convert a conservative ASCII chord-above-lyrics sheet into inline ChordPro. */

const chordToken = /^[A-G](?:#|b)?(?:(?:m|min|maj|M|dim|aug|sus|add|no)?(?:2|4|5|6|7|9|11|13)?(?:[#b](?:5|9|11|13))?)*(?:\/[A-G](?:#|b)?)?$/

function isChordRow(line: string): boolean {
  const tokens = [...line.matchAll(/\S+/g)]
  return tokens.length > 0 && tokens.every(([token]) => chordToken.test(token!))
}

function alignChordRow(chordRow: string, lyricRow: string): string {
  const lyricWords = [...lyricRow.matchAll(/\S+/g)]
  const chords = [...chordRow.matchAll(/\S+/g)]
  if (lyricWords.length === 0) return chords.map(([chord]) => `[${chord}]`).join(' ')

  const insertions = new Map<number, string[]>()
  for (const chordMatch of chords) {
    const chord = chordMatch[0]
    const column = chordMatch.index!
    const target = lyricWords.find((word) => word.index! >= column) ?? lyricWords.at(-1)!
    const targetIndex = target.index!
    const current = insertions.get(targetIndex) ?? []
    current.push(`[${chord}]`)
    insertions.set(targetIndex, current)
  }

  let result = ''
  let previous = 0
  for (const [index, prefixes] of [...insertions.entries()].sort(([a], [b]) => a - b)) {
    result += lyricRow.slice(previous, index) + prefixes.join('')
    previous = index
  }
  return result + lyricRow.slice(previous)
}

/** Preserve unknown/plain text exactly; only remove rows proven to be chord-only. */
export function importChordSheetText(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const output: string[] = []

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    if (!isChordRow(line) || /^\s*\{/.test(line)) {
      output.push(line)
      continue
    }

    const lyricIndex = index + 1
    const lyricLine = lines[lyricIndex]
    if (lyricLine != null && lyricLine.trim() && !isChordRow(lyricLine)) {
      output.push(alignChordRow(line, lyricLine))
      index = lyricIndex
    } else {
      output.push(alignChordRow(line, ''))
    }
  }

  return output.join('\n')
}
