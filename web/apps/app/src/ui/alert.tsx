import { useEffect, useState } from 'react'

export function ProblemAlert({ message }: { message: string | null }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!message) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 8000)
    return () => clearTimeout(timer)
  }, [message])

  if (!message || !visible) return null

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error-ink">
      <p role="alert" className="flex-1">
        {message}
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="shrink-0 text-error-ink/60 hover:text-error-ink"
        aria-label="Cerrar"
      >
        ×
      </button>
    </div>
  )
}

export function ConflictAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-ink"
    >
      {message}
    </p>
  )
}
