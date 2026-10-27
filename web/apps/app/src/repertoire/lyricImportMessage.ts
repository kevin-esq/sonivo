import type { I18nKey } from '../i18n/keys'

const diagnosticKeys: Record<string, I18nKey> = {
  'lyrics.metadataOmitted': 'lyrics.metadataOmitted',
  'lyrics.clippedTiming': 'lyrics.clippedTiming',
  'lyrics.incompleteWordTiming': 'lyrics.incompleteWordTiming',
  'lyrics.invalidTiming': 'lyrics.invalidTiming',
  'lyrics.invalidTtml': 'lyrics.invalidTtml',
  'lyrics.invalidXml': 'lyrics.invalidXml',
  'lyrics.unsupportedTiming': 'lyrics.unsupportedTiming',
  'lyrics.noLines': 'lyrics.noLines',
  'lyrics.tooManyMarks': 'lyrics.tooManyMarks',
  'no time mark': 'lyrics.noTimeMark',
  'unbalanced bracket': 'lyrics.unbalancedBracket',
  'offset is not an integer': 'lyrics.invalidOffset',
  'not valid UTF-8: decoded as Windows-1252; accented characters may be wrong': 'lyrics.encodingWarning',
  'time marks are not in ascending order; they will be sorted on import': 'lyrics.sortedWarning',
}

/** Unknown backend prose is never rendered as UI copy. */
export function lyricImportMessage(code: string, t: (key: I18nKey) => string): string {
  return t(diagnosticKeys[code] ?? 'lyrics.invalidImport')
}
