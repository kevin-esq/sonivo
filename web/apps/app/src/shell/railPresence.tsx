import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * The global player and the group workspace live in separate React branches.
 * The workspace shares its width and brand tokens so the player can sit beside
 * navigation and follow the active group's configured accent.
 */
type RailPresenceValue = {
  railPresent: boolean
  railCollapsed: boolean
  brandTokens: Record<string, string>
  setRailPresent: (present: boolean) => void
  setRailCollapsed: (collapsed: boolean) => void
  setBrandTokens: (tokens: Record<string, string>) => void
}

const RailPresenceContext = createContext<RailPresenceValue | null>(null)

export function RailPresenceProvider({ children }: { children: ReactNode }) {
  const [railPresent, setRailPresentState] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [brandTokens, setBrandTokens] = useState<Record<string, string>>({})
  const setRailPresent = useCallback((present: boolean) => setRailPresentState(present), [])
  const setRailCollapsedState = useCallback((collapsed: boolean) => setRailCollapsed(collapsed), [])
  const setBrandTokensState = useCallback((tokens: Record<string, string>) => setBrandTokens(tokens), [])
  const value = useMemo(
    () => ({ railPresent, railCollapsed, brandTokens, setRailPresent, setRailCollapsed: setRailCollapsedState, setBrandTokens: setBrandTokensState }),
    [railPresent, railCollapsed, brandTokens, setRailPresent, setRailCollapsedState, setBrandTokensState],
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
