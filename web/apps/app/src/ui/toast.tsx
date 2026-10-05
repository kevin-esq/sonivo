import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export type ToastKind = 'ok' | 'error' | 'info'

export type ToastInput = { kind: ToastKind; text: string }

type Toast = ToastInput & { id: number }

type ToastContextValue = { showToast: (toast: ToastInput) => void }

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 4000

const TOAST_TONE: Record<ToastKind, string> = {
  ok: 'bg-slate-900 text-white',
  error: 'bg-error-strong text-white',
  info: 'bg-surface text-ink ring-1 ring-slate-200',
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  return (
    <div
      role={toast.kind === 'error' ? 'alert' : undefined}
      className={`pointer-events-auto flex items-start gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${TOAST_TONE[toast.kind]}`}
    >
      <span className="min-w-0 flex-1">{toast.text}</span>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => onDismiss(toast.id)}
        className="-m-1 shrink-0 rounded-lg p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current motion-reduce:transition-none"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * App-wide transient messages. Mounted once around the routes; the container is
 * an `aria-live` region (errors also carry `role="alert"`) and sits above the
 * fixed bottom player and the mobile tab bar so it never covers them.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextIdRef = useRef(0)
  const timersRef = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id))
    const timer = timersRef.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const showToast = useCallback(
    ({ kind, text }: ToastInput) => {
      const id = nextIdRef.current++
      setToasts((list) => [...list, { id, kind, text }])
      timersRef.current.set(
        id,
        window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      )
    },
    [dismiss],
  )

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) window.clearTimeout(timer)
      timersRef.current.clear()
    },
    [],
  )

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-40 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-24"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within a ToastProvider')
  return context
}
