import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type Language = 'es' | 'en'

const STORAGE_KEY = 'sonivo:lang'

const es = {
  'chrome.tagline': 'Plan. Play. Together.',
  'chrome.security': 'Seguridad',
  'chrome.logout': 'Cerrar sesión',
  'chrome.login': 'Iniciar sesión',
  'nav.home': 'Inicio',
  'nav.setlists': 'Listas',
  'nav.events': 'Eventos',
  'nav.library': 'Biblioteca',
  'nav.people': 'Miembros',
  'workspace.myGroups': 'Mis grupos',
  'workspace.account': 'Cuenta',
  'workspace.logout': 'Cerrar sesión',
  'workspace.openMenu': 'Abrir menú',
  'workspace.closeMenu': 'Cerrar menú',
  'workspace.loadingGroup': 'Cargando grupo',
  'workspace.loadingGroupEllipsis': 'Cargando grupo…',
  'workspace.groupNav': 'Grupo',
  'workspace.sections': 'Secciones',
} as const

export type I18nKey = keyof typeof es

const en: Record<I18nKey, string> = {
  'chrome.tagline': 'Plan. Play. Together.',
  'chrome.security': 'Security',
  'chrome.logout': 'Sign out',
  'chrome.login': 'Sign in',
  'nav.home': 'Home',
  'nav.setlists': 'Setlists',
  'nav.events': 'Events',
  'nav.library': 'Library',
  'nav.people': 'Members',
  'workspace.myGroups': 'My groups',
  'workspace.account': 'Account',
  'workspace.logout': 'Sign out',
  'workspace.openMenu': 'Open menu',
  'workspace.closeMenu': 'Close menu',
  'workspace.loadingGroup': 'Loading group',
  'workspace.loadingGroupEllipsis': 'Loading group…',
  'workspace.groupNav': 'Group',
  'workspace.sections': 'Sections',
}

const dictionaries: Record<Language, Record<I18nKey, string>> = { es, en }

function isLanguage(value: string | null): value is Language {
  return value === 'es' || value === 'en'
}

function detectInitialLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isLanguage(stored)) return stored
  } catch {
    // storage unavailable (private mode); default below
  }
  // es-default: never auto-switch on navigator language (keeps E2E + SSR deterministic);
  // English applies only after an explicit user choice via setLang.
  return 'es'
}

type LanguageContextValue = {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: I18nKey) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(detectInitialLanguage)

  const setLang = useCallback((next: Language) => {
    setLangState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // persist best-effort only
    }
  }, [])

  const t = useCallback(
    (key: I18nKey): string => dictionaries[lang][key] ?? es[key],
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}

export function useT(): Pick<LanguageContextValue, 't' | 'lang'> {
  const { t, lang } = useLanguage()
  return { t, lang }
}
