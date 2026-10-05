import { mutationErrorMessage } from './ui'

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

const TYPE_HINT =
  'Este tipo de archivo no está permitido. Usa PDF, imagen (PNG, JPEG, WebP), audio (MP3, WAV, M4A) o texto plano.'

export function validateFileForUpload(file: File): string | null {
  if (file.size <= 0) {
    return 'El archivo está vacío. Elige otro archivo.'
  }
  if (file.size > MAX_FILE_BYTES) {
    return 'El archivo supera el máximo de 5 MiB.'
  }
  const mime = (file.type || '').toLowerCase().split(';')[0]?.trim() ?? ''
  const extMatch = /\.[^.]+$/.exec(file.name.toLowerCase())
  const ext = extMatch?.[0] ?? ''
  if (ALLOWED_EXTENSIONS.has(ext) || (mime !== '' && ALLOWED_MIMES.has(mime))) {
    return null
  }
  return TYPE_HINT
}

/** Maps API / network upload failures to clear Spanish copy. */
export function fileUploadErrorMessage(error: unknown): string {
  const raw = mutationErrorMessage(error)
  const lower = raw.toLowerCase()
  if (
    lower.includes('content type is not allowed') ||
    lower.includes('content type is required')
  ) {
    return TYPE_HINT
  }
  if (
    lower.includes('bytes or fewer') ||
    lower.includes('file must be') ||
    (lower.includes('5') && lower.includes('mib'))
  ) {
    return 'El archivo supera el máximo de 5 MiB.'
  }
  if (
    lower.includes('file is required') ||
    lower.includes('must not be empty') ||
    lower.includes('file must not be empty')
  ) {
    return 'Selecciona un archivo válido (no vacío).'
  }
  if (raw === 'Unexpected error') {
    return 'No se pudo subir el archivo. Inténtalo de nuevo.'
  }
  return raw
}
