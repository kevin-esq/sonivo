import { useEffect, useRef } from 'react'

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      className="w-[min(100%,24rem)] rounded-2xl border-0 bg-surface p-0 text-ink shadow-2xl"
    >
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-ink"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-error px-4 py-2 text-sm font-medium text-white hover:bg-error/90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
