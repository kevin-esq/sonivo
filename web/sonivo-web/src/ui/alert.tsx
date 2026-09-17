export function ProblemAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
      {message}
    </p>
  )
}

export function ConflictAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-neutral-dark"
    >
      {message}
    </p>
  )
}
