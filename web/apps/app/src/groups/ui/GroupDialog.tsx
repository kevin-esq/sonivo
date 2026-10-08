import { useCallback, useEffect, useId, useRef } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../ui/cn'
import { useT } from '../../i18n'

const SIZE_CLASS = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export type GroupDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  size?: keyof typeof SIZE_CLASS
  pending?: boolean
  testId?: string
  closeLabel?: string
}

export function GroupDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  onSubmit,
  size = 'md',
  pending,
  testId,
  closeLabel,
}: GroupDialogProps) {
  const { t } = useT()
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const titleId = useId()

  const requestClose = useCallback(() => {
    if (!pending) onClose()
  }, [pending, onClose])

  // Focus the first field on open and restore focus to the trigger on close.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const raf = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), textarea, select, [data-autofocus], button',
      )
      ;(target ?? panelRef.current)?.focus()
    })
    return () => {
      cancelAnimationFrame(raf)
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  // Escape closes; Tab is trapped inside the panel while open.
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, requestClose])

  if (!open) return null

  const body = (
    <>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div className="min-w-0 space-y-1">
          <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          {description ? <p className="text-sm text-muted">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => requestClose()}
          disabled={pending}
          aria-label={closeLabel ?? t('common.close')}
          className="-mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 motion-reduce:transition-none"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
      {footer ? (
        <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border-subtle px-5 py-4">
          {footer}
        </footer>
      ) : null}
    </>
  )

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-neutral-dark/60 p-4 py-10 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        className={cn(
          'relative w-full rounded-2xl border border-border-subtle bg-surface text-ink shadow-2xl outline-none',
          SIZE_CLASS[size],
        )}
      >
        <div className="flex max-h-[85dvh] flex-col">
          {onSubmit ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                onSubmit(event)
              }}
              className="flex min-h-0 flex-1 flex-col"
              noValidate
            >
              {body}
            </form>
          ) : (
            body
          )}
        </div>
      </div>
    </div>
  )
}
