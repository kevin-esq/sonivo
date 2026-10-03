import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  CheckSquare,
  FolderOpen,
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

/** Sectioned group workspace IA (ADR-0055, reference mockup). */
export const groupNavSections: GroupNavSection[] = [
  {
    id: 'main',
    items: [
      { id: 'home', labelKey: 'nav.home', icon: Home, end: true, href: (id) => `/groups/${id}` },
      { id: 'songs', labelKey: 'nav.songs', icon: Music2, href: (id) => `/groups/${id}/library` },
      { id: 'setlists', labelKey: 'nav.setlists', icon: ListMusic, href: (id) => `/groups/${id}/setlists` },
      { id: 'library', labelKey: 'nav.library', icon: Library, href: (id) => `/groups/${id}/library` },
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
      { id: 'resources', labelKey: 'nav.resources', icon: Library, href: (id) => `/groups/${id}/recursos` },
      { id: 'files', labelKey: 'nav.files', icon: FolderOpen, href: (id) => `/groups/${id}/archivos` },
    ],
  },
]

export const groupNavItems: GroupNavItem[] = groupNavSections.flatMap((section) => section.items)

export const mobileTabItems = groupNavItems
  .filter((item) => !item.desktopOnly)
  .filter((item) => ['home', 'songs', 'setlists', 'events'].includes(item.id))
