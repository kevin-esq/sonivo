import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * The global player (bottom bar) and the rail live in different branches of the
 * React tree, so the rail registers its presence here. With a rail visible at
 * >=768px, the fixed player is hidden to avoid duplicating transport; on mobile
 * and on routes without a rail the bar stays the same.
 */
type RailPresenceValue = {
  railPresent: boolean
  setRailPresent: (present: boolean) => void
}

const RailPresenceContext = createContext<RailPresenceValue | null>(null)

export function RailPresenceProvider({ children }: { children: ReactNode }) {
  const [railPresent, setRailPresentState] = useState(false)
  const setRailPresent = useCallback(
    (present: boolean) => setRailPresentState(present),
    [],
  )
  const value = useMemo(
    () => ({ railPresent, setRailPresent }),
    [railPresent, setRailPresent],
  )
  return (
    <RailPresenceContext.Provider value={value}>
      {children}
    </RailPresenceContext.Provider>
  )
}

export function useRailPresence(): RailPresenceValue {
  const context = useContext(RailPresenceContext)
  if (!context) throw new Error('useRailPresence must be used within RailPresenceProvider')
  return context
}
