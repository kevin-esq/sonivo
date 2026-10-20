import { useId, useRef, useState } from 'react'
import { File as FileIcon, UploadCloud, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useT } from '../i18n'
import { compressImageToMaxBytes, ImageOptimizationError } from './compressImage'
import { Button } from './button'
import { cn } from './cn'

export type FileDropzoneProps = {
  title: string
  description: string
  chooseLabel?: string
  removeLabel?: string
  accept?: string
  maxSizeBytes?: number
  file: File | null
  onFileChange: (file: File | null) => void
  disabled?: boolean
  icon?: LucideIcon
  selectedDetail?: string
  compact?: boolean
  testId?: string
}

/** Shared, accessible file selection surface. Upload authorization and validation stay with the caller/API. */
export function FileDropzone({
  title,
  description,
  chooseLabel,
  removeLabel,
  accept,
  maxSizeBytes,
  file,
  onFileChange,
  disabled = false,
  icon: Icon = UploadCloud,
  selectedDetail,
  compact = false,
  testId,
}: FileDropzoneProps) {
  const { t, lang } = useT()
  const inputId = useId()
  const titleId = useId()
  const descriptionId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [optimizing, setOptimizing] = useState(false)
  const chooseText = chooseLabel ?? t('fileDropzone.choose')
  const removeText = removeLabel ?? t('fileDropzone.remove')

  async function selectFile(next: File | null) {
    setSelectionError(null)
    if (!next) {
      onFileChange(null)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setOptimizing(true)
    try {
      const processed = maxSizeBytes === undefined
        ? next
        : await compressImageToMaxBytes(next, maxSizeBytes)
      if (processed.size > (maxSizeBytes ?? Number.POSITIVE_INFINITY)) {
        const maxSizeMiB = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(
          (maxSizeBytes ?? 0) / (1024 * 1024),
        )
        setSelectionError(t('fileDropzone.fileTooLarge', { size: maxSizeMiB }))
        return
      }
      onFileChange(processed)
    } catch (error) {
      if (error instanceof ImageOptimizationError && error.reason === 'input-too-large') {
        setSelectionError(t('fileDropzone.imageInputTooLarge', { size: 100 }))
      } else if (error instanceof ImageOptimizationError) {
        setSelectionError(t('fileDropzone.imageOptimizationFailed'))
      } else {
        setSelectionError(t('fileDropzone.imageOptimizationFailed'))
      }
    } finally {
      setOptimizing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (!disabled && !optimizing) void selectFile(event.dataTransfer.files?.[0] ?? null)
  }

  const fileSize = file
    ? new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(file.size / 1024) + ' KB'
    : null

  return (
    <div
      data-testid={testId}
      data-dragging={dragging || undefined}
      role="group"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={handleDrop}
      className={cn(
        'rounded-2xl border border-dashed transition-colors duration-150 motion-reduce:transition-none',
        compact ? 'p-3' : 'p-4 sm:p-5',
        dragging
          ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
          : 'border-border-subtle bg-surface-hover/50 hover:border-primary/45 hover:bg-surface-hover',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span
          className={cn(
            'grid shrink-0 place-items-center rounded-xl bg-primary/12 text-primary-ink',
            compact ? 'h-10 w-10' : 'h-12 w-12',
          )}
          aria-hidden="true"
        >
          {file ? <FileIcon className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span id={titleId} className="block truncate text-sm font-semibold text-ink" title={file?.name ?? title}>
            <span aria-live="polite">{file?.name ?? title}</span>
          </span>
          <span id={descriptionId} className="mt-0.5 block text-xs leading-relaxed text-muted">
          {file ? selectedDetail ?? (file.type ? `${fileSize} · ${file.type}` : fileSize) : description}
          </span>
        </span>
      </div>

      <div className={cn('flex flex-wrap items-center justify-between gap-2', compact ? 'mt-3' : 'mt-4')}>
        {selectionError ? (
          <p role="alert" className="text-xs font-medium text-error-ink">{selectionError}</p>
        ) : (
          <p className="text-xs text-muted">
            {optimizing
              ? t('fileDropzone.optimizing')
              : file
                ? t('fileDropzone.ready')
                : t('fileDropzone.dropPrompt')}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            disabled={disabled || optimizing}
            onClick={() => inputRef.current?.click()}
            aria-controls={inputId}
          >
            {chooseText}
          </Button>
          {file ? (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
              disabled={disabled || optimizing}
              onClick={() => selectFile(null)}
              aria-label={removeText}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span>{removeText}</span>
            </Button>
          ) : null}
        </div>
      </div>

      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled || optimizing}
        aria-label={title}
        className="sr-only"
        onChange={(event) => void selectFile(event.target.files?.[0] ?? null)}
      />
    </div>
  )
}
