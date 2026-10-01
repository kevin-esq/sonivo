import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, LayoutGrid, LogOut, Menu, Settings2, UserRound, Users } from 'lucide-react'
import { ApiError, fetchFeatures, getGroup, problemDetail, type CurrentUser, type GroupDetail } from '../api/client'
import { BrandLockup, SonivoMark } from '../brand/SonivoMark'
import { useT } from '../i18n'
import { ACCESS_DENIED_MESSAGE, formatMembershipRole } from '../repertoire/ui'
import { cn } from '../ui/cn'
import { Button } from '../ui/button'
import { coverUsesLightText, groupCoverStyle, isGradientCover, isNoneCover, readGroupAppearance } from './groupAccent'
import { GROUP_UPDATED_EVENT } from './groupEvents'
import { groupNavItems, mobileTabItems } from './nav'
import { applyDocumentBranding, loadServerBranding, type ServerBranding } from './serverBranding'
import { rememberLastGroup } from '../tenancy/groupSlug'
import { RailNowPlaying } from './RailNowPlaying'
import { GroupSwitcher } from './GroupSwitcher'
import { useRailPresence } from './railPresence'

const SIDEBAR_KEY = 'sonivo:sidebar'

type RailState = 'expanded' | 'collapsed'

function readRailState(): RailState {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed' ? 'collapsed' : 'expanded'
  } catch {
    return 'expanded'
  }
}

function railLinkClass(isActive: boolean, collapsed: boolean): string {
  return cn(
    'flex min-h-11 items-center rounded-xl text-sm font-medium no-underline transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary motion-reduce:transition-none',
    collapsed ? 'justify-center px-2' : 'gap-3 px-3 py-2.5',
    isActive
      ? 'bg-shell-hover text-shell-foreground'
      : 'text-shell-foreground/70 hover:bg-shell-hover hover:text-shell-foreground',
  )
}

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
  const [rail, setRail] = useState<RailState>(() => readRailState())
  const [brandingEnabled, setBrandingEnabled] = useState(false)
  const [serverBrand, setServerBrand] = useState<ServerBranding | null>(null)
  const { t } = useT()
  const { setRailPresent } = useRailPresence()

  // Phase 4.3: per-group branding behind Features:GroupBranding.
  useEffect(() => {
    let cancelled = false
    fetchFeatures()
      .then((flags) => {
        if (!cancelled) setBrandingEnabled(flags.groupBranding)
      })
      .catch(() => {
        if (!cancelled) setBrandingEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Registra el rail ante el reproductor global (oculta la barra inferior en >=768px).
  useEffect(() => {
    setRailPresent(true)
    return () => setRailPresent(false)
  }, [setRailPresent])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, rail)
    } catch {
      // Almacenamiento no disponible; la preferencia solo vive en memoria.
    }
  }, [rail])

  useEffect(() => {
    let cancelled = false
    async function load(reset: boolean) {
      if (!groupId) return
      if (reset) setGroup(undefined)
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
    void load(true)
    function onGroupUpdated() {
      void load(false)
    }
    window.addEventListener(GROUP_UPDATED_EVENT, onGroupUpdated)
    return () => {
      cancelled = true
      window.removeEventListener(GROUP_UPDATED_EVENT, onGroupUpdated)
    }
  }, [groupId, user.id])

  // Phase 4.3: load server-side branding (best effort) and apply document identity.
  useEffect(() => {
    let cancelled = false
    if (!group || !brandingEnabled) {
      setServerBrand(null)
      return
    }
    void loadServerBranding(group.id).then((branding) => {
      if (!cancelled) setServerBrand(branding)
    })
    return () => {
      cancelled = true
    }
  }, [group?.id, brandingEnabled])

  useEffect(() => {
    if (!group) return
    rememberLastGroup(group.id)
    applyDocumentBranding({
      name: serverBrand?.displayName ?? group.name,
      slug: group.slug ?? null,
      accentHex: serverBrand?.accentHex ?? null,
      logoUrl: serverBrand?.logoUrl ?? null,
    })
  }, [group, serverBrand])

  const deviceAppearance = readGroupAppearance(group?.id)
  const serverCover =
    serverBrand?.coverKind === 'gradient' && serverBrand.coverValue
      ? `gradient:${serverBrand.coverValue}`
      : serverBrand?.coverKind === 'emoji' && serverBrand.coverValue
        ? serverBrand.coverValue
        : null
  const appearance = serverBrand
    ? { accent: serverBrand.accentHex ?? deviceAppearance.accent, cover: serverCover ?? deviceAppearance.cover }
    : deviceAppearance
  const accountLabel = user.displayName || user.email || t('workspace.account')
  const plainCover = isNoneCover(appearance.cover)
  const collapsed = rail === 'collapsed'
  const groupRole = group ? formatMembershipRole(group.role) : ''
  const accent = appearance.accent

  return (
    <div
      className="min-h-screen bg-canvas md:flex md:h-screen md:overflow-hidden"
      data-testid="grupo-shell"
      style={{ '--group-accent': accent } as CSSProperties}
    >
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-shell-edge bg-shell text-shell-foreground md:flex md:h-screen',
          collapsed ? 'md:w-[4.5rem]' : 'md:w-60',
        )}
        data-testid="group-rail"
        data-rail={rail}
      >
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-4',
            collapsed ? 'flex-col' : 'justify-between',
          )}
        >
          {collapsed ? (
            <Link
              to="/"
              aria-label="Sonivo"
              className="grid min-h-11 min-w-11 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              <SonivoMark className="h-7 w-7 text-shell-link" />
            </Link>
          ) : (
            <BrandLockup to="/" shell />
          )}
          <button
            type="button"
            onClick={() => setRail((state) => (state === 'collapsed' ? 'expanded' : 'collapsed'))}
            aria-label={collapsed ? t('workspace.expandRail') : t('workspace.collapseRail')}
            aria-expanded={!collapsed}
            className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-shell-foreground/70 transition-colors hover:bg-shell-hover hover:text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary motion-reduce:transition-none"
            data-testid="rail-collapse-toggle"
          >
            {collapsed ? (
              <ChevronsRight size={18} aria-hidden="true" />
            ) : (
              <ChevronsLeft size={18} aria-hidden="true" />
            )}
          </button>
        </div>

        {group ? (
          <nav
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3"
            aria-label={t('workspace.groupNav')}
          >
            {groupNavItems.map((item) => {
              const Icon = item.icon
              const label = t(`nav.${item.id}`)
              return (
                <NavLink
                  key={item.id}
                  to={item.href(group.id)}
                  end={item.end}
                  aria-label={collapsed ? label : undefined}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) => railLinkClass(isActive, collapsed)}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className={cn(collapsed && 'sr-only')}>{label}</span>
                </NavLink>
              )
            })}
            <NavLink
              to={`/groups/${group.id}/ajustes`}
              aria-label={collapsed ? t('grupo.ajustes') : undefined}
              title={collapsed ? t('grupo.ajustes') : undefined}
              className={({ isActive }) => railLinkClass(isActive, collapsed)}
            >
              <Settings2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className={cn(collapsed && 'sr-only')}>{t('grupo.ajustes')}</span>
            </NavLink>
          </nav>
        ) : (
          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto text-sm text-shell-foreground/70',
              collapsed ? 'px-2' : 'px-5',
            )}
          >
            {group === undefined ? (
              <div className="space-y-2" role="status" aria-live="polite" aria-label={t('workspace.loadingGroup')}>
                <span className="sr-only">{t('workspace.loadingGroupEllipsis')}</span>
                <div className="h-3 w-28 animate-pulse rounded bg-shell-hover" />
                <div className="h-3 w-20 animate-pulse rounded bg-shell-hover" />
              </div>
            ) : null}
          </div>
        )}

        <RailNowPlaying collapsed={collapsed} />

        <div
          className={cn(
            'shrink-0 space-y-3 border-t border-shell-border py-4',
            collapsed ? 'px-2' : 'px-5',
          )}
        >
          {group ? (
            collapsed ? (
              <div className="flex flex-col items-center gap-1">
                <span
                  title={`${group.name} · ${groupRole}`}
                  className="grid h-10 w-10 place-items-center rounded-xl bg-shell-hover text-sm font-semibold text-shell-foreground"
                >
                  {group.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="sr-only">{`${group.name} · ${groupRole}`}</span>
              </div>
            ) : (
              <div>
                <p className="truncate text-sm font-semibold text-shell-foreground">{group.name}</p>
                <p className="text-xs text-shell-foreground/70">{groupRole}</p>
              </div>
            )
          ) : null}
          <Link
            to="/"
            aria-label={collapsed ? t('workspace.myGroups') : undefined}
            title={collapsed ? t('workspace.myGroups') : undefined}
            className={cn(
              'text-sm font-medium text-shell-link no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary',
              collapsed ? 'flex min-h-11 items-center justify-center' : 'flex min-h-11 items-center gap-2',
            )}
          >
            <LayoutGrid className={cn('h-4 w-4', collapsed ? '' : 'hidden')} aria-hidden="true" />
            <span className={cn(collapsed && 'sr-only')}>{t('workspace.myGroups')}</span>
          </Link>
          <Link
            to="/cuenta"
            aria-label={collapsed ? t('workspace.accountLink') : undefined}
            title={collapsed ? t('workspace.accountLink') : undefined}
            className={cn(
              'flex min-h-11 items-center text-sm font-medium text-shell-link no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary',
              collapsed ? 'justify-center' : 'gap-2',
            )}
          >
            <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className={cn(collapsed && 'sr-only')}>{t('workspace.accountLink')}</span>
          </Link>
          <div className={cn('flex items-start gap-2', collapsed ? 'justify-center' : 'justify-between')}>
            {collapsed ? null : (
              <p className="min-w-0 truncate text-xs text-shell-foreground/70">{accountLabel}</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              aria-label={collapsed ? t('workspace.logout') : undefined}
              title={collapsed ? t('workspace.logout') : undefined}
              className={cn(
                'h-auto px-0 text-xs text-shell-link hover:text-shell-foreground',
                'min-h-11',
                collapsed ? 'min-w-11 justify-center' : '',
              )}
              onClick={onLogout}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span className={cn(collapsed && 'sr-only')}>{t('workspace.logout')}</span>
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:h-screen md:overflow-hidden">
        <header className="flex items-center justify-between gap-2 px-4 py-3 md:hidden">
          <Link to="/" className="flex min-h-11 items-center gap-2 no-underline">
            <SonivoMark className="h-7 w-7 text-shell-link" />
            <span className="font-semibold text-shell-foreground">Sonivo</span>
          </Link>
          <div className="flex items-center gap-1">
            {/* "Más": exposes the desktop-only destinations (Miembros) that the
                4-tab bottom bar cannot carry, without shrinking its targets. */}
            {group ? (
              <details className="relative" data-testid="mobile-more">
                <summary
                  aria-label={t('workspace.more')}
                  className="grid min-h-11 min-w-11 cursor-pointer list-none place-items-center rounded-lg text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary [&::-webkit-details-marker]:hidden"
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </summary>
                <div className="absolute right-0 z-50 mt-1 w-48 rounded-xl border border-shell-border bg-surface p-1 text-ink shadow-lg">
                  <NavLink
                    to={`/groups/${group.id}/people`}
                    className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink no-underline hover:bg-neutral-light"
                  >
                    <Users className="h-4 w-4 text-primary-ink" aria-hidden="true" />
                    {t('nav.people')}
                  </NavLink>
                  <NavLink
                    to={`/groups/${group.id}/ajustes`}
                    className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink no-underline hover:bg-neutral-light"
                  >
                    <Settings2 className="h-4 w-4 text-primary-ink" aria-hidden="true" />
                    {t('grupo.ajustes')}
                  </NavLink>
                </div>
              </details>
            ) : null}
            <Link
              to="/cuenta"
              aria-label={t('grupo.openAccount')}
              className="grid min-h-11 min-w-11 place-items-center rounded-lg text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </Link>
            <button
              type="button"
              aria-label={t('workspace.logout')}
              onClick={onLogout}
              className="grid min-h-11 min-w-11 place-items-center rounded-lg text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div
          className="flex flex-1 flex-col md:min-h-0 md:overflow-y-auto"
          data-testid="group-content-scroll"
        >
          {group ? (
            <div className="px-3 pt-3">
              <div
                data-testid="group-bar"
                className="overflow-hidden rounded-2xl"
                style={groupCoverStyle(appearance.cover, appearance.accent)}
              >
                <div className="flex items-center gap-4 px-5 py-5">
                  <span
                    role="img"
                    aria-label={t('grupo.coverArt')}
                    className={cn(
                      'grid h-14 w-14 shrink-0 place-items-center rounded-xl text-3xl font-semibold',
                      plainCover ? 'bg-black/5 text-ink' : 'bg-black/25',
                    )}
                  >
                    {serverBrand?.logoUrl ? (
                      <img src={serverBrand.logoUrl} alt="" className="h-9 w-9 rounded object-contain" />
                    ) : isGradientCover(appearance.cover) || plainCover ? (
                      group.name.slice(0, 1).toUpperCase()
                    ) : (
                      appearance.cover
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'truncate text-2xl font-semibold tracking-tight md:text-3xl',
                        coverUsesLightText(appearance.cover) ? 'text-white' : 'text-ink',
                      )}
                    >
                      {group.name}
                    </p>
                    <p
                      className={cn(
                        'mt-0.5 text-sm',
                        coverUsesLightText(appearance.cover) ? 'text-white/80' : 'text-slate-600',
                      )}
                    >
                      {formatMembershipRole(group.role)}
                    </p>
                  </div>
                  <Link
                    to={`/groups/${group.id}/ajustes`}
                    className={cn(
                      'hidden min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium no-underline focus-visible:outline-2 focus-visible:outline-offset-2 md:inline-flex',
                      coverUsesLightText(appearance.cover)
                        ? 'bg-black/25 text-white focus-visible:outline-white'
                        : 'bg-black/5 text-ink focus-visible:outline-secondary',
                    )}
                  >
                    <Settings2 className="h-4 w-4" aria-hidden="true" />
                    {t('grupo.ajustes')}
                  </Link>
                  <div className="hidden md:block">
                    <GroupSwitcher currentGroupId={group.id} />
                  </div>
                </div>
              </div>
              <Link
                to={`/groups/${group.id}/ajustes`}
                className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-shell-link no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary md:hidden"
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
                {t('grupo.ajustes')}
              </Link>
            </div>
          ) : null}

          <main
            data-testid="group-content"
            className="m-3 flex-1 rounded-2xl bg-white text-neutral-dark"
          >
            <div className="px-5 py-6 pb-24 md:px-8 md:pb-8">
              {group === null ? (
                <div className="space-y-3">
                  <p role="alert" className="text-error-ink">
                    {error}
                  </p>
                  <Link className="font-semibold text-primary-ink no-underline hover:underline" to="/">
                    {t('workspace.myGroups')}
                  </Link>
                </div>
              ) : (
                children
              )}
            </div>
          </main>
        </div>
      </div>

      {group ? (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-shell-border bg-shell md:hidden"
          aria-label={t('workspace.sections')}
          data-testid="mobile-tabbar"
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
                        isActive ? 'text-shell-foreground' : 'text-shell-foreground/70',
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
