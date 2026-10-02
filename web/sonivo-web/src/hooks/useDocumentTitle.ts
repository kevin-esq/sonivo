import { useEffect, useRef } from 'react'

/**
 * Set `document.title` while mounted and restore the previous title on unmount.
 * The original title is captured once, so React StrictMode's double effect
 * (mount → cleanup → mount) re-applies the same override instead of fighting it.
 */
export function useDocumentTitle(title: string | null): void {
  const previousRef = useRef<string | null>(null)

  useEffect(() => {
    if (previousRef.current === null) previousRef.current = document.title
    document.title = title ?? previousRef.current ?? ''
    return () => {
      document.title = previousRef.current ?? ''
    }
  }, [title])
}
