import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * El reproductor global (barra inferior) y el rail viven en ramas distintas del
 * árbol de React, así que el rail registra su presencia aquí. Con un rail
 * visible en >=768px, el reproductor fijo se oculta para no duplicar el
 * transporte; en móvil y en rutas sin rail la barra sigue igual.
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
  if (!context) throw new Error('useRailPresence debe usarse dentro de RailPresenceProvider')
  return context
}
