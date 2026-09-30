import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { LogOut, Settings2, UserRound } from 'lucide-react'
import { ApiError, getGroup, problemDetail, type CurrentUser, type GroupDetail } from '../api/client'
import { BrandLockup, SonivoMark } from '../brand/SonivoMark'
import { useT } from '../i18n'
import { ACCESS_DENIED_MESSAGE, formatMembershipRole } from '../repertoire/ui'
import { cn } from '../ui/cn'
import { Button } from '../ui/button'
import { groupCoverStyle, isGradientCover, readGroupAppearance } from './groupAccent'
import { groupNavItems, mobileTabItems } from './nav'

const railLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium no-underline transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary motion-reduce:transition-none',
    isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white',
  )

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
  const { t } = useT()

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!groupId) return
      setGroup(undefined)
      setError(null)
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

  const appearance = readGroupAppearance(group?.id)
  const accountLabel = user.displayName || user.email || t('workspace.account')

  return (
    <div
      className="min-h-screen bg-canvas md:flex"
      data-testid="grupo-shell"
      style={{ '--group-accent': appearance.accent } as CSSProperties}
    >
      <aside className="hidden w-60 shrink-0 flex-col bg-neutral-dark text-neutral-light md:flex">
        <div className="px-5 py-5">
          <BrandLockup to="/" light />
        </div>
        {group ? (
          <nav className="flex flex-1 flex-col gap-1 px-3" aria-label={t('workspace.groupNav')}>
            {groupNavItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink key={item.id} to={item.href(group.id)} end={item.end} className={railLinkClass}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t(`nav.${item.id}`)}
                </NavLink>
              )
            })}
            <NavLink to={`/groups/${group.id}/ajustes`} className={railLinkClass}>
              <Settings2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t('grupo.ajustes')}
            </NavLink>
          </nav>
        ) : (
          <div className="flex-1 px-5 text-sm text-slate-400">
            {group === undefined ? (
              <div className="space-y-2" role="status" aria-live="polite" aria-label={t('workspace.loadingGroup')}>
                <span className="sr-only">{t('workspace.loadingGroupEllipsis')}</span>
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
            className="block text-sm font-medium text-secondary no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            {t('workspace.myGroups')}
          </Link>
          <Link
            to="/cuenta"
            className="flex min-h-11 items-center gap-2 text-sm font-medium text-secondary no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            {t('workspace.accountLink')}
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
              {t('workspace.logout')}
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 px-4 py-3 md:hidden">
          <Link to="/" className="flex min-h-11 items-center gap-2 no-underline">
            <SonivoMark className="h-7 w-7 text-white" />
            <span className="font-semibold text-white">Sonivo</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              to="/cuenta"
              aria-label={t('grupo.openAccount')}
              className="grid min-h-11 min-w-11 place-items-center rounded-lg text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </Link>
            <button
              type="button"
              aria-label={t('workspace.logout')}
              onClick={onLogout}
              className="grid min-h-11 min-w-11 place-items-center rounded-lg text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        {group ? (
          <div className="px-4 pt-1 md:px-8 md:pt-6">
            <div className="overflow-hidden rounded-2xl" style={groupCoverStyle(appearance.cover, appearance.accent)}>
              <div className="flex items-center gap-4 px-5 py-5">
                <span
                  role="img"
                  aria-label={t('grupo.coverArt')}
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-black/25 text-3xl font-semibold"
                >
                  {isGradientCover(appearance.cover) ? group.name.slice(0, 1).toUpperCase() : appearance.cover}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-2xl font-semibold tracking-tight text-white md:text-3xl">
                    {group.name}
                  </p>
                  <p className="mt-0.5 text-sm text-white/80">{formatMembershipRole(group.role)}</p>
                </div>
                <Link
                  to={`/groups/${group.id}/ajustes`}
                  className="hidden min-h-11 items-center gap-2 rounded-xl bg-black/25 px-3 text-sm font-medium text-white no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:inline-flex"
                >
                  <Settings2 className="h-4 w-4" aria-hidden="true" />
                  {t('grupo.ajustes')}
                </Link>
              </div>
            </div>
            <Link
              to={`/groups/${group.id}/ajustes`}
              className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-secondary no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary md:hidden"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              {t('grupo.ajustes')}
            </Link>
          </div>
        ) : null}

        <main className="flex-1 bg-white text-neutral-dark md:m-3 md:ml-0 md:rounded-2xl">
          <div className="px-5 py-6 pb-24 md:px-8 md:pb-8">
            {group === null ? (
              <div className="space-y-3">
                <p role="alert" className="text-error">
                  {error}
                </p>
                <Link className="font-semibold text-primary no-underline hover:underline" to="/">
                  {t('workspace.myGroups')}
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
          aria-label={t('workspace.sections')}
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
                        'flex min-h-11 flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium no-underline transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary motion-reduce:transition-none',
                        isActive ? 'text-white' : 'text-slate-400',
                      )
                    }
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {t(`nav.${item.id}`)}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  )
}
