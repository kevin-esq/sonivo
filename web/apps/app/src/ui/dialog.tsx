import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from './button'

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  pendingLabel = 'Working…',
  pending,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  pendingLabel?: string
  pending?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      cancelRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(100%,28rem)] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-0 bg-surface p-0 text-ink shadow-xl backdrop:bg-neutral-dark/60"
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onCancel()
      }}
      onClose={() => {
        if (open) onCancel()
      }}
    >
      <div className="space-y-4 p-5">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <div id={descriptionId} className="space-y-2 text-muted">{children}</div>
        <div className="flex flex-wrap gap-3">
          <Button variant="danger" disabled={pending || confirmDisabled} onClick={onConfirm}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
