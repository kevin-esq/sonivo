import { forwardRef, useId } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from './cn'
import { fieldClass } from './field'

/**
 * Shared field chrome: a linked `<label>`, an optional hint, and an optional
 * inline error wired through `aria-invalid` / `aria-describedby`. Labels, hints
 * and error copy are always passed in as props, so these primitives stay free of
 * i18n and page-specific copy.
 */
type FieldMeta = {
  label: string
  hint?: string
  error?: string | null
  id?: string
}

type FieldIds = {
  fieldId: string
  hintId: string | undefined
  errorId: string | undefined
  describedBy: string | undefined
}

function useFieldIds(id: string | undefined, hint?: string, error?: string | null): FieldIds {
  const autoId = useId()
  const fieldId = id ?? autoId
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = error ? `${fieldId}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined
  return { fieldId, hintId, errorId, describedBy }
}

function FieldError({ id, message }: { id: string | undefined; message: string | null | undefined }) {
  if (!message) return null
  return (
    <p id={id} className="text-sm text-error-ink">
      {message}
    </p>
  )
}

function FieldHint({ id, hint }: { id: string | undefined; hint?: string }) {
  if (!hint) return null
  return (
    <p id={id} className="text-xs text-muted">
      {hint}
    </p>
  )
}

export type TextFieldProps = FieldMeta &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
    /** Rendered inside the input row, e.g. a password reveal button. */
    trailing?: ReactNode
  }

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, id, trailing, className, ...props },
  ref,
) {
  const { fieldId, hintId, errorId, describedBy } = useFieldIds(id, hint, error)
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          ref={ref}
          // `trailing` may overlap the right edge, so reserve room for it.
          className={cn(fieldClass, trailing ? 'pr-24' : undefined, className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoCapitalize="none"
          spellCheck={false}
          {...props}
        />
        {trailing}
      </div>
      <FieldHint id={hintId} hint={hint} />
      <FieldError id={errorId} message={error} />
    </div>
  )
})

export type TextAreaProps = FieldMeta & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, id, className, ...props },
  ref,
) {
  const { fieldId, hintId, errorId, describedBy } = useFieldIds(id, hint, error)
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={fieldId}
        ref={ref}
        className={cn(fieldClass, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      <FieldHint id={hintId} hint={hint} />
      <FieldError id={errorId} message={error} />
    </div>
  )
})

export type SelectProps = FieldMeta & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, id, className, ...props },
  ref,
) {
  const { fieldId, hintId, errorId, describedBy } = useFieldIds(id, hint, error)
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={fieldId}
        ref={ref}
        className={cn(fieldClass, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      <FieldHint id={hintId} hint={hint} />
      <FieldError id={errorId} message={error} />
    </div>
  )
})
