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
  'listas.title': 'Biblioteca',
  'listas.subtitle': 'El repertorio del grupo: canciones para ensayar, arreglar y llevar a un evento.',
  'listas.songsLabel': 'Canciones',
  'listas.searchLabel': 'Buscar canciones',
  'listas.searchPlaceholder': 'Buscar por título o atribución…',
  'listas.resultsWord': 'resultados',
  'listas.noResultsTitle': 'Sin resultados para esta búsqueda',
  'listas.noResultsBody': 'Ninguna canción coincide con esa búsqueda. Prueba con otro título.',
  'listas.clearSearch': 'Limpiar búsqueda',
  'listas.colSong': 'Canción',
  'listas.colOrigin': 'Origen',
  'listas.noArrangements': 'Sin arreglo',
  'listas.noKey': 'Sin tonalidad',
  'listas.noResources': 'Sin recursos',
  'listas.resourceOne': 'recurso',
  'listas.resourcesMany': 'recursos',
  'listas.hasChart': 'Con partitura',
  'listas.noChart': 'Sin partitura',
  'listas.songFacts': 'Datos de la canción',
  'listas.tuningTitle': 'Afinación',
  'listas.musicTitle': 'Letra y acordes',
  'practica.tabs.label': 'Secciones de práctica',
  'practica.tabs.estudiar': 'Estudiar',
  'practica.tabs.avanzado': 'Avanzado',
  'practica.tabs.afinar': 'Afinar',
  'practica.avanzado.title': 'Herramientas avanzadas',
  'practica.avanzado.hint': 'Tiempos de seguimiento, digitalizador de audio y ensayo en vivo. Cada herramienta confirma antes de guardar.',
  'practica.avanzado.timingTitle': 'Tiempos y mapeo',
  'practica.avanzado.timingHint': 'Marca en qué milisegundo empieza cada línea. Se edita en el arreglo.',
  'practica.avanzado.timingLink': 'Editar tiempos en el arreglo',
  'practica.avanzado.digitizeTitle': 'Digitalizador de audio',
  'practica.avanzado.digitizeHint': 'Convierte un audio en borrador de marcas y letra. Revísalo y aplícalo aquí o desde el arreglo.',
  'practica.avanzado.digitizeLink': 'Abrir en el arreglo',
  'practica.avanzado.conductorHint': 'El ensayo en vivo aparece al ensayar desde un evento.',
  'practica.afinar.title': 'Afinar',
  'practica.afinar.hint': 'Afina tu instrumento con el micrófono antes de ensayar.',
  'agenda.setlistsTitle': 'Listas',
  'agenda.setlistsSubtitle': 'Crea y administra tus listas. Luego podrás aplicarlas a tus eventos.',
  'agenda.setlistsCountLabel': 'listas',
  'agenda.setlistsSearchLabel': 'Buscar listas',
  'agenda.setlistsSearchPlaceholder': 'Buscar listas…',
  'agenda.setlistsColList': 'Lista',
  'agenda.setlistsColSongs': 'Arreglos',
  'agenda.setlistsColUpdated': 'Actualizada',
  'agenda.setlistVacant': 'Vacía',
  'agenda.setlistArrangementsOne': '1 arreglo',
  'agenda.setlistArrangementsMany': 'arreglos',
  'agenda.eventsTitle': 'Eventos',
  'agenda.eventsSubtitle': 'Ensaya y toca con un plan copiado para cada ocasión.',
  'agenda.eventsCountLabel': 'eventos',
  'agenda.eventsSearchLabel': 'Buscar eventos',
  'agenda.eventsSearchPlaceholder': 'Buscar eventos…',
  'agenda.eventsColEvent': 'Evento',
  'agenda.eventsColWhen': 'Fecha',
  'agenda.eventsColStatus': 'Estado',
  'agenda.statusCancelled': 'Evento cancelado',
  'agenda.statusPlan': 'Plan aplicado',
  'agenda.statusDraft': 'Borrador',
  'agenda.statusScheduled': 'Programado',
  'agenda.emptySetlistsTitle': 'Aún no hay listas',
  'agenda.emptyEventsTitle': 'Aún no hay eventos',
  'agenda.emptyPlanTitle': 'Aún no hay plan',
  'agenda.emptySetlistTitle': 'Aún no hay arreglos en esta lista',
  'agenda.resultsWord': 'resultados',
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
  'listas.title': 'Library',
  'listas.subtitle': 'The group repertoire: songs to rehearse, arrange, and bring to an event.',
  'listas.songsLabel': 'Songs',
  'listas.searchLabel': 'Search songs',
  'listas.searchPlaceholder': 'Search by title or attribution…',
  'listas.resultsWord': 'results',
  'listas.noResultsTitle': 'No results for this search',
  'listas.noResultsBody': 'No song matches that search. Try another title.',
  'listas.clearSearch': 'Clear search',
  'listas.colSong': 'Song',
  'listas.colOrigin': 'Origin',
  'listas.noArrangements': 'No arrangements',
  'listas.noKey': 'No key',
  'listas.noResources': 'No resources',
  'listas.resourceOne': 'resource',
  'listas.resourcesMany': 'resources',
  'listas.hasChart': 'With chart',
  'listas.noChart': 'No chart',
  'listas.songFacts': 'Song details',
  'listas.tuningTitle': 'Tuning',
  'listas.musicTitle': 'Lyrics and chords',
  'practica.tabs.label': 'Practice sections',
  'practica.tabs.estudiar': 'Study',
  'practica.tabs.avanzado': 'Advanced',
  'practica.tabs.afinar': 'Tune',
  'practica.avanzado.title': 'Advanced tools',
  'practica.avanzado.hint': 'Follow timing, audio digitizer, and live rehearsal. Each tool confirms before saving.',
  'practica.avanzado.timingTitle': 'Timing and mapping',
  'practica.avanzado.timingHint': 'Mark at which millisecond each line starts. Edited on the arrangement.',
  'practica.avanzado.timingLink': 'Edit timing on the arrangement',
  'practica.avanzado.digitizeTitle': 'Audio digitizer',
  'practica.avanzado.digitizeHint': 'Turn audio into a marks and lyrics draft. Review and apply here or from the arrangement.',
  'practica.avanzado.digitizeLink': 'Open on the arrangement',
  'practica.avanzado.conductorHint': 'Live rehearsal appears when rehearsing from an event.',
  'practica.afinar.title': 'Tune',
  'practica.afinar.hint': 'Tune your instrument with the microphone before rehearsing.',
  'agenda.setlistsTitle': 'Setlists',
  'agenda.setlistsSubtitle': 'Create and manage your setlists. Then apply them to your events.',
  'agenda.setlistsCountLabel': 'setlists',
  'agenda.setlistsSearchLabel': 'Search setlists',
  'agenda.setlistsSearchPlaceholder': 'Search setlists…',
  'agenda.setlistsColList': 'Setlist',
  'agenda.setlistsColSongs': 'Arrangements',
  'agenda.setlistsColUpdated': 'Updated',
  'agenda.setlistVacant': 'Empty',
  'agenda.setlistArrangementsOne': '1 arrangement',
  'agenda.setlistArrangementsMany': 'arrangements',
  'agenda.eventsTitle': 'Events',
  'agenda.eventsSubtitle': 'Rehearse and perform with a copied plan for each occasion.',
  'agenda.eventsCountLabel': 'events',
  'agenda.eventsSearchLabel': 'Search events',
  'agenda.eventsSearchPlaceholder': 'Search events…',
  'agenda.eventsColEvent': 'Event',
  'agenda.eventsColWhen': 'Date',
  'agenda.eventsColStatus': 'Status',
  'agenda.statusCancelled': 'Event cancelled',
  'agenda.statusPlan': 'Plan applied',
  'agenda.statusDraft': 'Draft',
  'agenda.statusScheduled': 'Scheduled',
  'agenda.emptySetlistsTitle': 'No setlists yet',
  'agenda.emptyEventsTitle': 'No events yet',
  'agenda.emptyPlanTitle': 'No plan yet',
  'agenda.emptySetlistTitle': 'No arrangements in this setlist yet',
  'agenda.resultsWord': 'results',
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
