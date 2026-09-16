import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, getGroup, problemDetail, type GroupDetail } from '../api/client'

export const CONFLICT_MESSAGE =
  'Someone else changed this item. Reload to get the latest version.'

export const fieldClass = 'w-full border border-slate-400 px-3 py-2'
export const primaryButtonClass =
  'border border-slate-800 bg-slate-900 px-4 py-2 text-white disabled:opacity-50'
export const secondaryButtonClass =
  'border border-slate-400 bg-white px-4 py-2 text-slate-900 disabled:opacity-50'
export const dangerButtonClass =
  'border border-red-800 bg-red-800 px-4 py-2 text-white disabled:opacity-50'

export function isOwnerRole(role: string | undefined): boolean {
  return role === 'Owner'
}

export function formatOriginKind(kind: string): string {
  switch (kind) {
    case 'original':
      return 'Original'
    case 'cover':
      return 'Cover'
    case 'other':
      return 'Other'
    default:
      return kind
  }
}

export function formatPurpose(purpose: string): string {
  return purpose.charAt(0).toUpperCase() + purpose.slice(1)
}

export function authzErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  if (error.status === 403) {
    return 'You do not have permission to change this item.'
  }
  if (error.status === 401) {
    return 'Your session has expired. Please log in again.'
  }
  return null
}

export function mutationErrorMessage(error: unknown): string {
  return authzErrorMessage(error) ?? problemDetail(error)
}

export function ProblemAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="text-red-700">
      {message}
    </p>
  )
}

export function ConflictAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="border border-amber-600 bg-amber-50 px-3 py-2 text-amber-950">
      {message}
    </p>
  )
}

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
      className="w-[min(100%,28rem)] max-w-[calc(100%-2rem)] border border-slate-400 bg-white p-0 text-slate-900 backdrop:bg-slate-900/40"
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onCancel()
      }}
      onClose={() => {
        if (open) onCancel()
      }}
    >
      <div className="space-y-4 p-5">
        <h2 id={titleId} className="text-lg font-medium">
          {title}
        </h2>
        <div className="space-y-2 text-slate-700">{children}</div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={dangerButtonClass}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  )
}

export function useGroupContext(groupId: string | undefined, userId: string) {
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    if (!groupId) return
    setError(null)
    try {
      setGroup(await getGroup(groupId))
    } catch (err) {
      setGroup(null)
      if (err instanceof ApiError && err.status === 404) {
        setError('Group not found or you do not have access.')
      } else {
        setError(problemDetail(err))
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!groupId) return
      setGroup(undefined)
      setError(null)
      try {
        const result = await getGroup(groupId)
        if (!cancelled) setGroup(result)
      } catch (err) {
        if (cancelled) return
        setGroup(null)
        if (err instanceof ApiError && err.status === 404) {
          setError('Group not found or you do not have access.')
        } else {
          setError(problemDetail(err))
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, userId])

  return { group, error, reload }
}
