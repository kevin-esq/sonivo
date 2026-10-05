import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'sonivo:theme'

type ThemeContextValue = {
  theme: Theme
  /** Explicit user choice: persists and overrides any group default. */
  setTheme: (theme: Theme) => void
  /** Group default (ADR-0054): applies only while the user has made no explicit choice. */
  applyDefault: (theme: string | null | undefined) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function isTheme(value: string | null | undefined): value is Theme {
  return value === 'light' || value === 'dark'
}

function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isTheme(stored)) return stored
  } catch {
    // storage unavailable; fall through to default
  }
  return null
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme() ?? 'dark')
  // Once the user chooses explicitly, a group default must not override it.
  const explicitRef = useRef(readStoredTheme() !== null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    if (explicitRef.current) {
      try {
        window.localStorage.setItem(STORAGE_KEY, theme)
      } catch {
        // persist best-effort only
      }
    }
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    explicitRef.current = true
    setThemeState(next)
  }, [])

  const applyDefault = useCallback((next: string | null | undefined) => {
    if (!isTheme(next) || explicitRef.current) return
    setThemeState(next)
  }, [])

  const toggle = useCallback(() => {
    explicitRef.current = true
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = useMemo(
    () => ({ theme, setTheme, applyDefault, toggle }),
    [theme, setTheme, applyDefault, toggle],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
