import { useCallback, useEffect, useRef, useState } from 'react'

/** Clipboard write with a hidden-textarea fallback for insecure contexts. */
async function writeText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  return fallbackWriteText(text)
}

function fallbackWriteText(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  try {
    textarea.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

/**
 * Copy text to the clipboard, flipping `copied` for `resetDelayMs` so the UI can
 * confirm the action.
 */
export function useCopyToClipboard(resetDelayMs = 2000): {
  copy: (text: string) => Promise<boolean>
  copied: boolean
} {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      const ok = await writeText(text)
      if (!ok) return false
      setCopied(true)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        setCopied(false)
      }, resetDelayMs)
      return true
    },
    [resetDelayMs],
  )

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  return { copy, copied }
}
