import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  ChartNoAxesCombined,
  CheckSquare,
  CircleHelp,
  Home,
  Library,
  ListMusic,
  Music2,
  ShieldCheck,
  Settings2,
  Users,
} from 'lucide-react'
import type { I18nKey } from '../i18n'
import { routes } from '../routing/routes'

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
 * Group navigation follows the member workflow: overview, repertoire,
 * schedule, team, then owner-facing administration. Resource library remains
 * grouped with music while files stay attached to their domain records.
 */
export const groupNavSections: GroupNavSection[] = [
  {
    id: 'overview',
    labelKey: 'nav.sectionOverview',
    items: [
      { id: 'home', labelKey: 'nav.home', icon: Home, end: true, href: routes.group },
    ],
  },
  {
    id: 'music',
    labelKey: 'nav.sectionMusic',
    items: [
      { id: 'songs', labelKey: 'nav.songs', icon: Music2, href: routes.groupLibrary },
      { id: 'setlists', labelKey: 'nav.setlists', icon: ListMusic, href: routes.groupSetlists },
      { id: 'resources', labelKey: 'nav.resources', icon: Library, href: routes.groupResources },
    ],
  },
  {
    id: 'schedule',
    labelKey: 'nav.sectionSchedule',
    items: [
      { id: 'calendar', labelKey: 'nav.calendar', icon: CalendarDays, href: routes.groupCalendar },
      { id: 'events', labelKey: 'nav.events', icon: CalendarDays, href: routes.groupEvents },
      { id: 'tasks', labelKey: 'nav.tasks', icon: CheckSquare, href: routes.groupTasks },
    ],
  },
  {
    id: 'team',
    labelKey: 'nav.sectionTeam',
    items: [
      { id: 'people', labelKey: 'nav.people', icon: Users, desktopOnly: true, href: routes.groupPeople },
      { id: 'roles', labelKey: 'nav.roles', icon: ShieldCheck, href: routes.groupRoles },
    ],
  },
  {
    id: 'administration',
    labelKey: 'nav.sectionAdministration',
    items: [
      { id: 'reports', labelKey: 'nav.reports', icon: ChartNoAxesCombined, desktopOnly: true, href: routes.groupReports },
      { id: 'settings', labelKey: 'group.settings', icon: Settings2, href: routes.groupSettings },
      { id: 'help', labelKey: 'sidebar.help', icon: CircleHelp, href: routes.groupHelp },
    ],
  },
]

export const groupNavItems: GroupNavItem[] = groupNavSections.flatMap((section) => section.items)

export const mobileQuickItems = ['home', 'songs', 'setlists', 'events', 'tasks', 'people', 'resources']
  .flatMap((id) => groupNavItems.filter((item) => item.id === id))
