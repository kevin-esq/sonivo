import { mutationErrorMessage } from './ui'
import type { I18nKey } from '../i18n'

/** Matches ResourceFileConstraints.MaxByteSize (5 MiB). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'audio/x-wav',
  'audio/x-m4a',
  'text/plain',
])

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.mp3',
  '.wav',
  '.m4a',
  '.txt',
])

const TYPE_HINT_KEY: I18nKey = 'arrangement.fileTypeNotAllowed'

export function validateFileForUpload(
  file: File,
  t: (key: I18nKey) => string,
): string | null {
  if (file.size <= 0) {
    return t('arrangement.fileEmpty')
  }
  if (file.size > MAX_FILE_BYTES) {
    return t('arrangement.fileTooLarge')
  }
  const mime = (file.type || '').toLowerCase().split(';')[0]?.trim() ?? ''
  const extMatch = /\.[^.]+$/.exec(file.name.toLowerCase())
  const ext = extMatch?.[0] ?? ''
  if (ALLOWED_EXTENSIONS.has(ext) || (mime !== '' && ALLOWED_MIMES.has(mime))) {
    return null
  }
  return t(TYPE_HINT_KEY)
}

/** Maps API / network upload failures to clear localized copy. */
export function fileUploadErrorMessage(
  error: unknown,
  t: (key: I18nKey) => string,
): string {
  const raw = mutationErrorMessage(error)
  const lower = raw.toLowerCase()
  if (
    lower.includes('content type is not allowed') ||
    lower.includes('content type is required')
  ) {
    return t(TYPE_HINT_KEY)
  }
  if (
    lower.includes('bytes or fewer') ||
    lower.includes('file must be') ||
    (lower.includes('5') && lower.includes('mib'))
  ) {
    return t('arrangement.fileTooLarge')
  }
  if (
    lower.includes('file is required') ||
    lower.includes('must not be empty') ||
    lower.includes('file must not be empty')
  ) {
    return t('arrangement.fileInvalid')
  }
  if (raw === 'Unexpected error') {
    return t('arrangement.uploadFailed')
  }
  return raw
}
