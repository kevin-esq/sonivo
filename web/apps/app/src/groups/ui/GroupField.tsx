import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { cn } from '../../ui/cn'

/** Shared control chrome for group inputs/selects/textarea. */
export const groupFieldClass =
  'min-h-11 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-ink outline-none transition duration-150 placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60'

export const groupFieldErrorClass = 'border-error/60 focus:border-error focus:ring-error/25'

type FieldMeta = {
  label?: string
  hint?: string
  error?: string | null
  id?: string
}

function useFieldIds(id: string | undefined, hint?: string, error?: string | null) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = error ? `${fieldId}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined
  return { fieldId, hintId, errorId, describedBy }
}

function FieldMessages({
  hintId,
  errorId,
  hint,
  error,
}: {
  hintId?: string
  errorId?: string
  hint?: string
  error?: string | null
}) {
  return (
    <>
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-error-ink">
          {error}
        </p>
      ) : null}
    </>
  )
}

/**
 * Label/hint/error wrapper for custom group controls (e.g. `GroupSelect`).
 * Pass a render function so the control can consume the generated `id` and
 * `aria-describedby` values.
 */
export function GroupField({
  label,
  hint,
  error,
  id,
  children,
  className,
}: FieldMeta & {
  children: (meta: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
  className?: string
}) {
  const { fieldId, hintId, errorId, describedBy } = useFieldIds(id, hint, error)
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label htmlFor={fieldId} className="block text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}
      {children({ id: fieldId, describedBy, invalid: Boolean(error) })}
      <FieldMessages hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  )
}

export type GroupInputProps = FieldMeta &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>

export const GroupInput = forwardRef<HTMLInputElement, GroupInputProps>(function GroupInput(
  { label, hint, error, id, className, ...props },
  ref,
) {
  const { fieldId, hintId, errorId, describedBy } = useFieldIds(id, hint, error)
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={fieldId} className="block text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}
      <input
        id={fieldId}
        ref={ref}
        className={cn(groupFieldClass, error && groupFieldErrorClass, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      <FieldMessages hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  )
})

export type GroupTextAreaProps = FieldMeta &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>

export const GroupTextArea = forwardRef<HTMLTextAreaElement, GroupTextAreaProps>(
  function GroupTextArea({ label, hint, error, id, className, ...props }, ref) {
    const { fieldId, hintId, errorId, describedBy } = useFieldIds(id, hint, error)
    return (
      <div className="space-y-1.5">
        {label ? (
          <label htmlFor={fieldId} className="block text-sm font-medium text-ink">
            {label}
          </label>
        ) : null}
        <textarea
          id={fieldId}
          ref={ref}
          className={cn(groupFieldClass, error && groupFieldErrorClass, className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
        <FieldMessages hintId={hintId} errorId={errorId} hint={hint} error={error} />
      </div>
    )
  },
)
