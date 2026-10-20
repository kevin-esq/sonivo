import { ApiError } from '../api/http'
import type { I18nKey } from '../i18n'

/** Matches the non-audio Resource limit; audio uses the active plan limit below. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
const MIB = 1024 * 1024

export function resourceUploadLimit(planId: string | null | undefined, purpose: string): number {
  if (purpose !== 'audio') return MAX_FILE_BYTES
  if (!planId) return 25 * MIB
  switch (planId) {
    case 'starter': return 25 * MIB
    case 'pro': return 100 * MIB
    default: return 250 * MIB
  }
}

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'audio/mpeg',
  'audio/flac',
  'audio/x-flac',
  'audio/aac',
  'audio/ogg',
  'audio/x-m4a',
  'audio/x-wav',
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
  '.flac',
  '.aac',
  '.ogg',
  '.wav',
  '.m4a',
  '.txt',
])

const TYPE_HINT_KEY: I18nKey = 'arrangement.fileTypeNotAllowed'

export function validateFileForUpload(
  file: File,
  t: (key: I18nKey) => string,
  maxBytes = MAX_FILE_BYTES,
): string | null {
  if (file.size <= 0) {
    return t('arrangement.fileEmpty')
  }
  if (file.size > maxBytes) {
    return t('arrangement.fileTooLargeForPlan')
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
  if (error instanceof ApiError && error.status === 413) {
    return t('arrangement.fileTooLargeForPlan')
  }
  if (error instanceof ApiError && error.status === 400) return t(TYPE_HINT_KEY)
  return t('arrangement.uploadFailed')
}
