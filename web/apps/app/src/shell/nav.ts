import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  CheckSquare,
  Home,
  Library,
  ListMusic,
  Music2,
  ShieldCheck,
  Users,
} from 'lucide-react'
import type { I18nKey } from '../i18n'

export type GroupNavItem = {
  id: string
  labelKey: I18nKey
  icon: LucideIcon
  end?: boolean
  desktopOnly?: boolean
  href: (groupId: string) => string
}

export type GroupNavSection = {
  id: string
  labelKey?: I18nKey
  items: GroupNavItem[]
}

/**
 * Sectioned group workspace IA (ADR-0055 + owner addendum 2026-10-03).
 * Music = structured songs + setlists; Library/Archivos are not top-level
 * sections — files live on their song/event/resource. Resources is a
 * cross-cutting top-level section.
 */
export const groupNavSections: GroupNavSection[] = [
  {
    id: 'main',
    items: [
      { id: 'home', labelKey: 'nav.home', icon: Home, end: true, href: (id) => `/groups/${id}` },
    ],
  },
  {
    id: 'music',
    labelKey: 'nav.sectionMusic',
    items: [
      { id: 'songs', labelKey: 'nav.songs', icon: Music2, href: (id) => `/groups/${id}/library` },
      { id: 'setlists', labelKey: 'nav.setlists', icon: ListMusic, href: (id) => `/groups/${id}/setlists` },
    ],
  },
  {
    id: 'organization',
    labelKey: 'nav.sectionOrganization',
    items: [
      { id: 'calendar', labelKey: 'nav.calendar', icon: CalendarDays, href: (id) => `/groups/${id}/calendario` },
      { id: 'events', labelKey: 'nav.events', icon: CalendarDays, href: (id) => `/groups/${id}/events` },
      { id: 'tasks', labelKey: 'nav.tasks', icon: CheckSquare, href: (id) => `/groups/${id}/tasks` },
    ],
  },
  {
    id: 'team',
    labelKey: 'nav.sectionTeam',
    items: [
      { id: 'people', labelKey: 'nav.people', icon: Users, desktopOnly: true, href: (id) => `/groups/${id}/people` },
      { id: 'roles', labelKey: 'nav.roles', icon: ShieldCheck, href: (id) => `/groups/${id}/roles` },
    ],
  },
  {
    id: 'resources',
    items: [
      { id: 'resources', labelKey: 'nav.resources', icon: Library, href: (id) => `/groups/${id}/recursos` },
    ],
  },
]

export const groupNavItems: GroupNavItem[] = groupNavSections.flatMap((section) => section.items)

/**
 * Primary mobile destinations (approved 2026-10-05): Home, Songs,
 * Events, Tasks. Picked for the four highest-frequency tasks so the bottom
 * bar carries four real tabs (the previous list resolved to three, leaving a
 * dead 5th column in a `grid-cols-5`).
 */
const MOBILE_TAB_IDS = ['home', 'songs', 'events', 'tasks'] as const

export const mobileTabItems: GroupNavItem[] = MOBILE_TAB_IDS
  .map((id) => groupNavItems.find((item) => item.id === id))
  .filter((item): item is GroupNavItem => Boolean(item))

/**
 * Everything else lives in the single "More" sheet (nav.ts), plus Settings which
 * the workspace appends. Keeps full parity with the desktop rail.
 */
export const mobileMoreItems = groupNavItems.filter(
  (item) => !(MOBILE_TAB_IDS as readonly string[]).includes(item.id),
)
