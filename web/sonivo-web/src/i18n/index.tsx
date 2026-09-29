import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type Language = 'es' | 'en'

const STORAGE_KEY = 'sonivo:lang'

const es = {
  'chrome.tagline': 'Plan. Play. Together.',
  'chrome.security': 'Seguridad',
  'chrome.logout': 'Cerrar sesión',
  'chrome.login': 'Iniciar sesión',
  'chrome.account': 'Cuenta',
  'nav.home': 'Inicio',
  'nav.setlists': 'Listas',
  'nav.events': 'Eventos',
  'nav.library': 'Biblioteca',
  'nav.people': 'Miembros',
  'workspace.myGroups': 'Mis grupos',
  'workspace.account': 'Cuenta',
  'workspace.accountLink': 'Cuenta',
  'workspace.logout': 'Cerrar sesión',
  'workspace.openMenu': 'Abrir menú',
  'workspace.closeMenu': 'Cerrar menú',
  'workspace.loadingGroup': 'Cargando grupo',
  'workspace.loadingGroupEllipsis': 'Cargando grupo…',
  'workspace.groupNav': 'Grupo',
  'workspace.sections': 'Secciones',
  'cuenta.title': 'Cuenta',
  'cuenta.profile': 'Perfil',
  'cuenta.preferences': 'Preferencias',
  'cuenta.security': 'Seguridad',
  'cuenta.groups': 'Mis grupos',
  'cuenta.nav': 'Secciones de la cuenta',
  'cuenta.language': 'Idioma',
  'cuenta.languageHint': 'Se aplica al instante y se recuerda en este dispositivo.',
  'cuenta.spanish': 'Español',
  'cuenta.english': 'Inglés',
  'cuenta.theme': 'Tema',
  'cuenta.themeHint': 'Claro u oscuro para todo Sonivo.',
  'cuenta.themeLight': 'Claro',
  'cuenta.themeDark': 'Oscuro',
  'grupo.coverArt': 'Portada del grupo',
  'grupo.ajustes': 'Ajustes del grupo',
  'grupo.openAccount': 'Abrir cuenta',
  'ajustes.title': 'Ajustes del grupo',
  'ajustes.subtitle': 'Identidad visual del grupo en este dispositivo.',
  'ajustes.name': 'Nombre del grupo',
  'ajustes.nameReadonly': 'El nombre es de solo lectura por ahora. Renombrarlo llega en una próxima oleada.',
  'ajustes.accent': 'Color de acento',
  'ajustes.accentHint': 'Tiñe el encabezado, la navegación activa y los focos de este grupo.',
  'ajustes.cover': 'Portada',
  'ajustes.coverHint': 'Elige un emoji o un degradado para el encabezado del grupo.',
  'ajustes.logoNote': 'Logotipo: marcador de posición. Subir el logo del grupo llega en una próxima oleada.',
  'ajustes.ownerHint': 'Como organizador, tus cambios se aplican al instante y se guardan en este dispositivo.',
  'ajustes.memberReadonly': 'Solo lectura: solo la persona organizadora puede cambiar la identidad del grupo.',
  'ajustes.saved': 'Guardado en este dispositivo.',
} as const

export type I18nKey = keyof typeof es

const en: Record<I18nKey, string> = {
  'chrome.tagline': 'Plan. Play. Together.',
  'chrome.security': 'Security',
  'chrome.logout': 'Sign out',
  'chrome.login': 'Sign in',
  'chrome.account': 'Account',
  'nav.home': 'Home',
  'nav.setlists': 'Setlists',
  'nav.events': 'Events',
  'nav.library': 'Library',
  'nav.people': 'Members',
  'workspace.myGroups': 'My groups',
  'workspace.account': 'Account',
  'workspace.accountLink': 'Account',
  'workspace.logout': 'Sign out',
  'workspace.openMenu': 'Open menu',
  'workspace.closeMenu': 'Close menu',
  'workspace.loadingGroup': 'Loading group',
  'workspace.loadingGroupEllipsis': 'Loading group…',
  'workspace.groupNav': 'Group',
  'workspace.sections': 'Sections',
  'cuenta.title': 'Account',
  'cuenta.profile': 'Profile',
  'cuenta.preferences': 'Preferences',
  'cuenta.security': 'Security',
  'cuenta.groups': 'My groups',
  'cuenta.nav': 'Account sections',
  'cuenta.language': 'Language',
  'cuenta.languageHint': 'Applies instantly and is remembered on this device.',
  'cuenta.spanish': 'Spanish',
  'cuenta.english': 'English',
  'cuenta.theme': 'Theme',
  'cuenta.themeHint': 'Light or dark across Sonivo.',
  'cuenta.themeLight': 'Light',
  'cuenta.themeDark': 'Dark',
  'grupo.coverArt': 'Group cover',
  'grupo.ajustes': 'Group settings',
  'grupo.openAccount': 'Open account',
  'ajustes.title': 'Group settings',
  'ajustes.subtitle': 'Group visual identity on this device.',
  'ajustes.name': 'Group name',
  'ajustes.nameReadonly': 'The name is read-only for now. Renaming arrives in a later wave.',
  'ajustes.accent': 'Accent color',
  'ajustes.accentHint': 'Tints the header, active nav and focus rings for this group.',
  'ajustes.cover': 'Cover',
  'ajustes.coverHint': 'Pick an emoji or a gradient for the group header.',
  'ajustes.logoNote': 'Logo: placeholder. Uploading the group logo arrives in a later wave.',
  'ajustes.ownerHint': 'As an organizer, your changes apply instantly and are saved on this device.',
  'ajustes.memberReadonly': 'Read-only: only the organizer can change the group identity.',
  'ajustes.saved': 'Saved on this device.',
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
