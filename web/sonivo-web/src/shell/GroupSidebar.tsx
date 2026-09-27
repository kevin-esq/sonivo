import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { 
  ChevronLeft, 
  ChevronRight, 
  Music, 
  Calendar, 
  ListMusic, 
  Users, 
  Settings 
} from 'lucide-react'

interface GroupSidebarProps {
  groupId: string
}

export function GroupSidebar({ groupId }: GroupSidebarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sonivo_sidebar_collapsed') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('sonivo_sidebar_collapsed', String(collapsed))
  }, [collapsed])

  const navItems = [
    { label: 'Repertorio', path: `/groups/${groupId}/library`, icon: Music },
    { label: 'Setlists', path: `/groups/${groupId}/setlists`, icon: ListMusic },
    { label: 'Eventos', path: `/groups/${groupId}/events`, icon: Calendar },
    { label: 'Equipo', path: `/groups/${groupId}/people`, icon: Users },
    { label: 'Configuración', path: `/groups/${groupId}/settings`, icon: Settings },
  ]

  return (
    <aside
      className={`sticky top-0 h-screen bg-slate-900 border-r border-slate-800 text-slate-300 transition-all duration-300 ease-in-out flex flex-col z-30 shrink-0 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
        {!collapsed && <span className="font-bold text-white tracking-wider text-lg">SONIVO</span>}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          aria-label={collapsed ? 'Expandir menú de navegación' : 'Colapsar menú de navegación'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto" aria-label="Navegación principal del grupo">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white font-medium shadow-lg shadow-indigo-600/20'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`
              }
              title={collapsed ? item.label : undefined}
            >
              <Icon size={20} className="shrink-0" />
              {!collapsed && <span className="truncate text-sm">{item.label}</span>}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}
