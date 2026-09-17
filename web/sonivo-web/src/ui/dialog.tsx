import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from './button'

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="w-[min(100%,28rem)] max-w-[calc(100%-2rem)] rounded-2xl border-0 bg-white p-0 text-neutral-dark shadow-xl backdrop:bg-neutral-dark/60"
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
        <div className="space-y-2 text-slate-600">{children}</div>
        <div className="flex flex-wrap gap-3">
          <Button variant="danger" disabled={pending} onClick={onConfirm}>
            {pending ? 'Working…' : confirmLabel}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </dialog>
  )
}
