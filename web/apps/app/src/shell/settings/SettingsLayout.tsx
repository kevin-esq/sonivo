import { NavLink, Outlet } from 'react-router-dom'
import { User, ShieldCheck, Users } from 'lucide-react'
import { useT } from '../../i18n'

export function SettingsLayout() {
  const { t } = useT()
  const tabs = [
    { label: t('accountSettings.tabProfile'), path: '/settings/profile', icon: User },
    { label: t('accountSettings.tabSecurity'), path: '/settings/security', icon: ShieldCheck },
    { label: t('accountSettings.tabTeam'), path: '/settings/team', icon: Users },
  ]

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{t('accountSettings.title')}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{t('accountSettings.subtitle')}</p>
      </header>

      <nav className="flex gap-2 border-b border-slate-200 dark:border-slate-800 mb-8 overflow-x-auto" aria-label={t('accountSettings.tabsLabel')}>
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none ${
                  isActive
                    ? 'border-primary text-shell-link'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 hover:border-slate-300'
                }`
              }
            >
              <Icon size={18} />
              <span>{tab.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <main className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <Outlet />
      </main>
    </div>
  )
}
