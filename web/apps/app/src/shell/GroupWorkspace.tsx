import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, NavLink, useLocation, useParams } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, LogOut, Menu, Settings2, UserRound, Users } from 'lucide-react'
import {
  ApiError,
  fetchFeatures,
  getGroup,
  listMembers,
  problemDetail,
  type CurrentUser,
  type GroupDetail,
  type MemberListItem,
} from '../api/client'
import { BrandLockup, SonivoMark } from '../brand/SonivoMark'
import { useT } from '../i18n'
import { ACCESS_DENIED_MESSAGE, formatMembershipRole } from '../repertoire/ui'
import { cn } from '../ui/cn'
import { readGroupAppearance } from './groupAccent'
import { GROUP_UPDATED_EVENT } from './groupEvents'
import { groupNavSections, mobileTabItems, mobileMoreItems } from './nav'
import {
  applyDocumentBranding,
  brandTokenStyle,
  loadServerBranding,
  readCachedBranding,
  writeCachedBranding,
  type ServerBranding,
} from './serverBranding'
import { useTheme } from '../brand/theme'
import { rememberLastGroup } from '../tenancy/groupSlug'
import { RailNowPlaying } from './RailNowPlaying'
import { useRailPresence } from './railPresence'
import { BrandPreviewContext, type BrandTokenMap } from './brandPreview'
import { useGroupLive } from '../groups/useGroupLive'
import { GroupTopBar } from './GroupTopBar'
import { GroupContextRail } from './GroupContextRail'

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
  const location = useLocation()
  // The context rail (Semana / Hoy / Listas / Tu progreso) is home-only chrome.
  const onGroupHome = Boolean(groupId) && (location.pathname === `/groups/${groupId}` || location.pathname === `/groups/${groupId}/`)
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [rail, setRail] = useState<RailState>(() => readRailState())
  const [brandingEnabled, setBrandingEnabled] = useState<boolean | null>(null)
  // Branding resolved from the server for the current group; `null` while the
  // first load is in flight. Keyed by group so switching groups never flashes
  // the previous group's colour.
  const [fetchedBrand, setFetchedBrand] = useState<{
    groupId: string
    brand: ServerBranding | null
  } | null>(null)
  // First-paint hint from the last resolved branding, so a returning visit paints
  // the group colour immediately instead of the default and then swapping.
  const cachedBrand = useMemo(() => readCachedBranding(groupId), [groupId])
  const serverBrand =
    fetchedBrand && fetchedBrand.groupId === groupId
      ? fetchedBrand.brand
      : brandingEnabled === false
        ? null
        : cachedBrand
  const [members, setMembers] = useState<MemberListItem[] | null>(null)
  // Bumped when the group entity changes (rename, branding save) so the shell
  // re-fetches branding instead of showing the previous theme until a reload.
  const [brandReloadKey, setBrandReloadKey] = useState(0)
  // Live brand preview while the branding editor is open (see brandPreview.tsx).
  const [previewTokens, setPreviewTokens] = useState<BrandTokenMap | null>(null)
  const { t } = useT()
  const { setRailPresent } = useRailPresence()
  const { theme } = useTheme()

  // Cross-user real time for the current group (all group pages).
  useGroupLive(group?.id)

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

  // Registers the rail with the global player (hides the bottom bar at >=768px).
  useEffect(() => {
    setRailPresent(true)
    return () => setRailPresent(false)
  }, [setRailPresent])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, rail)
    } catch {
      // Storage unavailable; the preference only lives in memory.
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
      setBrandReloadKey((key) => key + 1)
    }
    window.addEventListener(GROUP_UPDATED_EVENT, onGroupUpdated)
    return () => {
      cancelled = true
      window.removeEventListener(GROUP_UPDATED_EVENT, onGroupUpdated)
    }
  }, [groupId, user.id])

  // Phase 4.3: load server-side branding (best effort) and cache it so the next
  // entry paints the group colour on the first frame (no default→brand flash).
  useEffect(() => {
    if (!group) return
    if (brandingEnabled === false) {
      setFetchedBrand({ groupId: group.id, brand: null })
      writeCachedBranding(group.id, null)
      return
    }
    if (brandingEnabled !== true) return
    let cancelled = false
    void loadServerBranding(group.id).then((branding) => {
      if (cancelled) return
      setFetchedBrand({ groupId: group.id, brand: branding })
      writeCachedBranding(group.id, branding)
    })
    return () => {
      cancelled = true
    }
  }, [group?.id, brandingEnabled, brandReloadKey])

  // Group identity block: member avatars + count (best effort; never blocks).
  useEffect(() => {
    let cancelled = false
    if (!group) {
      setMembers(null)
      return
    }
    void listMembers(group.id)
      .then((list) => {
        if (!cancelled) setMembers(list)
      })
      .catch(() => {
        if (!cancelled) setMembers(null)
      })
    return () => {
      cancelled = true
    }
  }, [group?.id])

  // Layout effect so document identity (title, favicon, theme-color) follows the
  // cached/fetched branding from the first frame. Theme is account-scoped only
  // (ADR-0054 group theme default retired): the workspace never overrides the
  // user's chosen theme, so switching it in settings persists across navigation.
  useLayoutEffect(() => {
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
  const collapsed = rail === 'collapsed'
  const groupRole = group ? formatMembershipRole(group.role, t) : ''
  const accent = appearance.accent

  const brandTokens = brandTokenStyle(serverBrand, { primary: accent, theme })
  const shellStyle = {
    ...brandTokens,
    ...(previewTokens ?? {}),
    // Liquid-glass accent wash over the canvas (token from deriveGroupThemeTokens).
    backgroundImage: 'var(--brand-wash)',
  } as CSSProperties

  return (
    <BrandPreviewContext.Provider value={{ tokens: previewTokens, setTokens: setPreviewTokens }}>
    <div
      className="min-h-screen bg-canvas font-sans md:fixed md:inset-0 md:flex md:overflow-hidden"
      data-testid="grupo-shell"
      style={shellStyle}
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
              to={group ? `/groups/${group.id}` : '/'}
              aria-label={group ? group.name : 'Sonivo'}
              className="grid min-h-11 min-w-11 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              {group ? (
                <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-lg bg-shell-hover text-sm font-semibold text-shell-foreground">
                  {serverBrand?.logoUrl ? (
                    <img src={serverBrand.logoUrl} alt="" className="h-5 w-5 object-contain" />
                  ) : (
                    group.name.slice(0, 1).toUpperCase()
                  )}
                </span>
              ) : (
                <SonivoMark className="h-7 w-7 text-shell-link" />
              )}
            </Link>
          ) : group ? (
            <Link
              to={`/groups/${group.id}`}
              data-testid="rail-brand"
              className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-shell-hover text-sm font-semibold text-shell-foreground">
                {serverBrand?.logoUrl ? (
                  <img src={serverBrand.logoUrl} alt="" className="h-6 w-6 object-contain" />
                ) : (
                  group.name.slice(0, 1).toUpperCase()
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-sm font-semibold text-shell-foreground">
                  {serverBrand?.displayName ?? group.name}
                </span>
                {serverBrand?.tagline ? (
                  <span className="block truncate text-xs text-shell-foreground/60">{serverBrand.tagline}</span>
                ) : (
                  <span className="block truncate text-xs text-shell-foreground/60">{groupRole}</span>
                )}
              </span>
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
            className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3"
            aria-label={t('workspace.groupNav')}
          >
            {groupNavSections.map((section) => (
              <div key={section.id} className="space-y-1">
                {section.labelKey && !collapsed ? (
                  <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-shell-foreground/45">
                    {t(section.labelKey)}
                  </p>
                ) : null}
                {section.items.map((item) => {
                  const Icon = item.icon
                  const label = t(item.labelKey)
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
              </div>
            ))}
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
            'shrink-0 border-t border-shell-border py-4',
            collapsed ? 'px-2' : 'px-3',
          )}
        >
          {group ? (
            <NavLink
              to={`/groups/${group.id}/ajustes`}
              data-testid="rail-settings"
              aria-label={collapsed ? t('group.settings') : undefined}
              title={collapsed ? t('group.settings') : undefined}
              className={({ isActive }) => railLinkClass(isActive, collapsed)}
            >
              <Settings2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className={cn(collapsed && 'sr-only')}>{t('group.settings')}</span>
            </NavLink>
          ) : null}
        </div>

        {/* Powered by Sonivo - subtle attribution */}
        {group ? (
          <div
            className={cn(
              'shrink-0 border-t border-shell-border py-2',
              collapsed ? 'px-2' : 'px-3',
            )}
          >
            {collapsed ? (
              <p className="text-center text-[10px] text-shell-foreground/30">
                Powered by Sonivo
              </p>
            ) : (
              <p className="text-center text-[10px] text-shell-foreground/30">
                Powered by Sonivo
              </p>
            )}
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:h-screen md:min-h-0 md:overflow-hidden">
        {group ? (
          <GroupTopBar groupId={group.id} user={user} role={group.role} onLogout={onLogout} />
        ) : null}
        <header className="flex items-center justify-between gap-2 px-4 py-3 md:hidden">
          <Link to="/" className="flex min-h-11 items-center gap-2 no-underline">
            <SonivoMark className="h-7 w-7 text-shell-link" />
            <span className="font-semibold text-shell-foreground">Sonivo</span>
          </Link>
          <div className="flex items-center gap-1">
            {/* Single "More" lives in the bottom tab bar; the top bar keeps only
                account + sign-out so there is exactly one overflow menu per
                breakpoint (owner request 2026-10-05). */}
            <details className="relative" data-testid="mobile-user-menu">
              <summary
                aria-label={t('workspace.account')}
                className="grid min-h-11 min-w-11 cursor-pointer list-none place-items-center rounded-lg text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary [&::-webkit-details-marker]:hidden"
              >
                <UserRound className="h-5 w-5" aria-hidden="true" />
              </summary>
              <nav
                aria-label={t('workspace.account')}
                className="absolute right-0 top-full z-50 mt-1 w-56 space-y-0.5 rounded-xl border border-shell-border bg-surface p-1 text-ink shadow-lg"
              >
                <Link to="/grupos" className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink no-underline hover:bg-neutral-light">
                  <Users className="h-4 w-4 text-primary-ink" aria-hidden="true" />
                  {t('workspace.myGroups')}
                </Link>
                <Link to="/cuenta" className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink no-underline hover:bg-neutral-light">
                  <UserRound className="h-4 w-4 text-primary-ink" aria-hidden="true" />
                  {t('workspace.account')}
                </Link>
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-error-ink transition-colors hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('workspace.logout')}
                </button>
              </nav>
            </details>
          </div>
        </header>

        <div
          className="flex flex-1 flex-col md:min-h-0 md:overflow-y-auto"
          data-testid="group-content-scroll"
        >
          <div className="flex min-w-0 flex-1 md:min-h-0">
            <div className="min-w-0 flex-1 md:min-h-0">

              <main
                data-testid="group-content"
                className="m-3 flex-1 rounded-2xl bg-surface text-ink"
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
            {group && onGroupHome ? (
              <div className="py-3 pr-3">
                <GroupContextRail groupId={group.id} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {group ? (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-shell-border bg-shell md:hidden"
          aria-label={t('workspace.sections')}
          data-testid="mobile-tabbar"
        >
          <ul
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${mobileTabItems.length + 1}, minmax(0, 1fr))`,
            }}
          >
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
                    {t(item.labelKey)}
                  </NavLink>
                </li>
              )
            })}
            <li>
              <details className="relative" data-testid="mobile-more">
                <summary
                  aria-label={t('workspace.more')}
                  className="flex min-h-11 cursor-pointer list-none flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium text-shell-foreground/70 transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary motion-reduce:transition-none [&::-webkit-details-marker]:hidden"
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                  {t('workspace.more')}
                </summary>
                <div className="absolute bottom-full right-0 z-50 mb-1 max-h-[70vh] w-52 overflow-y-auto rounded-xl border border-shell-border bg-surface p-1 text-ink shadow-lg">
                  {mobileMoreItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <NavLink
                        key={item.id}
                        to={item.href(group.id)}
                        end={item.end}
                        className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink no-underline hover:bg-neutral-light"
                      >
                        <Icon className="h-4 w-4 text-primary-ink" aria-hidden="true" />
                        {t(item.labelKey)}
                      </NavLink>
                    )
                  })}
                  <NavLink
                    to={`/groups/${group.id}/ajustes`}
                    className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink no-underline hover:bg-neutral-light"
                  >
                    <Settings2 className="h-4 w-4 text-primary-ink" aria-hidden="true" />
                    {t('group.settings')}
                  </NavLink>
                </div>
              </details>
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
    </BrandPreviewContext.Provider>
  )
}
