import type { LucideIcon } from 'lucide-react'
import { CalendarDays, Home, Library, ListMusic, Users } from 'lucide-react'

export type GroupNavItem = {
  id: 'home' | 'library' | 'setlists' | 'events' | 'people'
  label: string
  icon: LucideIcon
  end?: boolean
  desktopOnly?: boolean
  href: (groupId: string) => string
}

export const groupNavItems: GroupNavItem[] = [
  { id: 'home', label: 'Inicio', icon: Home, end: true, href: (id) => `/groups/${id}` },
  { id: 'library', label: 'Biblioteca', icon: Library, href: (id) => `/groups/${id}/library` },
  {
    id: 'setlists',
    label: 'Setlists',
    icon: ListMusic,
    href: (id) => `/groups/${id}/setlists`,
  },
  { id: 'events', label: 'Eventos', icon: CalendarDays, href: (id) => `/groups/${id}/events` },
  {
    id: 'people',
    label: 'Miembros',
    icon: Users,
    desktopOnly: true,
    href: (id) => `/groups/${id}/people`,
  },
]

export const mobileTabItems = groupNavItems.filter((item) => !item.desktopOnly)
