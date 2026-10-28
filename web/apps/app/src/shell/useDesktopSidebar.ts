import { useEffect, useState, type FocusEvent, type KeyboardEvent } from 'react'

const SIDEBAR_KEY = 'sonivo:sidebar'

/** Pinning reserves page space; pointer and keyboard previews only overlay it. */
export function useDesktopSidebar() {
  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) !== 'collapsed'
    } catch {
      return true
    }
  })
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const expanded = pinned || (!dismissed && (hovered || focused))

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, pinned ? 'expanded' : 'collapsed')
    } catch {
      // The preference remains usable when browser storage is unavailable.
    }
  }, [pinned])

  return {
    pinned,
    expanded,
    toggle: () => {
      setPinned((value) => !value)
      setDismissed(true)
    },
    interactionProps: {
      onMouseEnter: () => { setHovered(true); setDismissed(false) },
      onMouseLeave: () => setHovered(false),
      onFocusCapture: (event: FocusEvent<HTMLElement>) => {
        if (event.target.matches(':focus-visible')) {
          setFocused(true)
          setDismissed(false)
        }
      },
      onBlurCapture: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Escape' && !pinned && expanded) {
          setDismissed(true)
          event.preventDefault()
          event.stopPropagation()
        }
      },
    },
  }
}
