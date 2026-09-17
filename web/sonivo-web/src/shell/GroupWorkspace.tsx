import { useEffect, useId, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import { ApiError, getGroup, problemDetail, type CurrentUser, type GroupDetail } from '../api/client'
import { BrandLockup, SonivoMark } from '../brand/SonivoMark'
import { ACCESS_DENIED_MESSAGE, formatMembershipRole } from '../repertoire/ui'
import { cn } from '../ui/cn'
import { Button } from '../ui/button'
import { groupNavItems, mobileTabItems } from './nav'

export function GroupWorkspace({
  user,
  onLogout,
  children,
}: {
  user: CurrentUser
  onLogout: () => void
  children: React.ReactNode
}) {
  const { groupId } = useParams()
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerTitleId = useId()

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!groupId) return
      setGroup(undefined)
      setError(null)
      setDrawerOpen(false)
      try {
        const result = await getGroup(groupId)
        if (!cancelled) setGroup(result)
      } catch (err) {
        if (cancelled) return
        setGroup(null)
        if (err instanceof ApiError && err.status === 404) {
          setError(ACCESS_DENIED_MESSAGE)
        } else {
          setError(problemDetail(err))
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, user.id])

  useEffect(() => {
    if (!drawerOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const accountLabel = user.displayName || user.email || 'Cuenta'

  return (
    <div className="min-h-screen bg-canvas md:flex">
      <aside className="hidden w-60 shrink-0 flex-col bg-neutral-dark text-neutral-light md:flex">
        <div className="px-5 py-5">
          <BrandLockup to="/" light />
        </div>
        {group ? (
          <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Grupo">
            {groupNavItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.id}
                  to={item.href(group.id)}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium no-underline transition duration-150',
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white',
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
        ) : (
          <div className="flex-1 px-5 text-sm text-slate-400">
            {group === undefined ? (
              <div className="space-y-2" role="status" aria-live="polite" aria-label="Cargando grupo">
                <span className="sr-only">Cargando grupo…</span>
                <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
                <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
              </div>
            ) : null}
          </div>
        )}
        <div className="mt-auto space-y-3 border-t border-white/10 px-5 py-4">
          {group ? (
            <div>
              <p className="truncate text-sm font-semibold text-white">{group.name}</p>
              <p className="text-xs text-slate-400">{formatMembershipRole(group.role)}</p>
            </div>
          ) : null}
          <Link
            to="/"
            className="block text-sm font-medium text-secondary no-underline hover:underline"
          >
            Mis grupos
          </Link>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-slate-400">{accountLabel}</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-0 text-xs text-secondary hover:text-white"
              onClick={onLogout}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Cerrar sesión
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 md:hidden">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <SonivoMark className="h-7 w-7 text-white" />
            <span className="font-semibold text-white">Sonivo</span>
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-white"
            aria-expanded={drawerOpen}
            aria-controls="account-drawer"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Abrir menú</span>
          </button>
        </header>

        <main className="flex-1 bg-white text-neutral-dark md:m-3 md:ml-0 md:rounded-2xl">
          <div className="px-5 py-6 pb-24 md:px-8 md:pb-8">
            {group === null ? (
              <div className="space-y-3">
                <p role="alert" className="text-error">
                  {error}
                </p>
                <Link className="font-semibold text-primary no-underline hover:underline" to="/">
                  Mis grupos
                </Link>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>

      {group ? (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-neutral-dark md:hidden"
          aria-label="Secciones"
        >
          <ul className="grid grid-cols-4">
            {mobileTabItems.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.id}>
                  <NavLink
                    to={item.href(group.id)}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'flex flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium no-underline transition duration-150',
                        isActive ? 'text-white' : 'text-slate-400',
                      )
                    }
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
      ) : null}

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" id="account-drawer">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Cerrar menú"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={drawerTitleId}
            className="absolute inset-y-0 right-0 flex w-[min(100%,20rem)] flex-col bg-neutral-dark p-5 text-neutral-light shadow-2xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <p id={drawerTitleId} className="font-semibold">
                Cuenta
              </p>
              <button type="button" className="rounded-lg p-1" onClick={() => setDrawerOpen(false)}>
                <X className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Cerrar menú</span>
              </button>
            </div>
            {group ? (
              <div className="mb-4">
                <p className="font-semibold">{group.name}</p>
                <p className="text-sm text-slate-400">{formatMembershipRole(group.role)}</p>
              </div>
            ) : null}
            {group ? (
              <Link
                to={`/groups/${group.id}/people`}
                className="rounded-xl px-3 py-2 text-sm font-medium text-white no-underline hover:bg-white/10"
                onClick={() => setDrawerOpen(false)}
              >
                Miembros
              </Link>
            ) : null}
            <Link
              to="/"
              className="rounded-xl px-3 py-2 text-sm font-medium text-secondary no-underline hover:bg-white/10"
              onClick={() => setDrawerOpen(false)}
            >
              Mis grupos
            </Link>
            <div className="mt-auto space-y-3 border-t border-white/10 pt-4">
              <p className="truncate text-sm text-slate-300">{user.email}</p>
              <Button variant="ghost" className="justify-start px-0 text-secondary" onClick={onLogout}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Cerrar sesión
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
