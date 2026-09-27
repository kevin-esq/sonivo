import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { 
  ChevronLeft, 
  ChevronRight, 
  Music, 
  Calendar, 
  ListMusic, 
  Users, 
  Settings,
  Music2
} from 'lucide-react'

interface GroupSidebarProps {
  groupId: string
  groupName?: string
}

export function GroupSidebar({ groupId, groupName }: GroupSidebarProps) {
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
      className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-white/10 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-300 transition-all duration-300 ease-in-out lg:static shrink-0 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-500/20 text-white shrink-0">
            <Music2 size={18} />
          </div>
          {!collapsed && <span className="text-lg font-bold text-white tracking-tight">Sonivo</span>}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          aria-label={collapsed ? 'Expandir menú de navegación' : 'Colapsar menú de navegación'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Active Group Switcher Pill */}
      {!collapsed && (
        <div className="p-3 border-b border-white/5">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-white/5 border border-white/10">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 font-semibold text-xs shrink-0">
              {groupName ? groupName.charAt(0).toUpperCase() : 'G'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">{groupName || 'Grupo Activo'}</p>
              <p className="text-[11px] text-slate-400">Grupo de música</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation items (Independent Scroll Container) */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Navegación principal del grupo">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/30 font-medium shadow-md shadow-indigo-600/10'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate text-sm">{item.label}</span>}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}
