import { cn } from '../ui/cn'
import { useEffect } from 'react'

/** Focus an active surface while keeping the current page in place. */
export function FocusBackdrop({ onDismiss, testId, className }: { onDismiss: () => void; testId: string; className?: string }) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])
  return (
    <div
      data-testid={testId}
      aria-hidden="true"
      className={cn("shell-focus-backdrop fixed inset-x-0 bottom-0 top-[var(--shell-header-height,4rem)] z-10 bg-canvas/70 backdrop-blur-sm", className)}
      onPointerDown={(event) => { event.preventDefault(); onDismiss() }}
    />
  )
}
