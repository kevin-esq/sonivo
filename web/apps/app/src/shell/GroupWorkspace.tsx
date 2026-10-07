import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { ChevronUp, ChevronsLeft, ChevronsRight, LogOut, Menu, Settings2, UserRound, Users } from 'lucide-react'
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
import { plural } from '../ui/plural'
import { BrandLockup, SonivoMark } from '../brand/SonivoMark'
import { useT } from '../i18n'
import { ACCESS_DENIED_MESSAGE, formatMembershipRole } from '../repertoire/ui'
import { cn } from '../ui/cn'
import { coverUsesLightText, groupCoverStyle, isGradientCover, isNoneCover, readGroupAppearance } from './groupAccent'
import { GROUP_UPDATED_EVENT } from './groupEvents'
import { groupNavSections, mobileTabItems, mobileMoreItems } from './nav'
import { applyDocumentBranding, brandTokenStyle, loadServerBranding, type ServerBranding } from './serverBranding'
import { useTheme } from '../brand/theme'
import { rememberLastGroup } from '../tenancy/groupSlug'
import { RailNowPlaying } from './RailNowPlaying'
import { GroupSwitcher } from './GroupSwitcher'
import { useRailPresence } from './railPresence'
import { BrandPreviewContext, type BrandTokenMap } from './brandPreview'
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
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [rail, setRail] = useState<RailState>(() => readRailState())
  const [brandingEnabled, setBrandingEnabled] = useState(false)
  const [serverBrand, setServerBrand] = useState<ServerBranding | null>(null)
  const [members, setMembers] = useState<MemberListItem[] | null>(null)
  // Live brand preview while the branding editor is open (see brandPreview.tsx).
  const [previewTokens, setPreviewTokens] = useState<BrandTokenMap | null>(null)
  const { t } = useT()
  const { setRailPresent } = useRailPresence()
  const { theme, applyDefault } = useTheme()

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

  useEffect(() => {
    if (!group) return
    rememberLastGroup(group.id)
    applyDocumentBranding({
      name: serverBrand?.displayName ?? group.name,
      slug: group.slug ?? null,
      accentHex: serverBrand?.accentHex ?? null,
      logoUrl: serverBrand?.logoUrl ?? null,
    })
    // ADR-0054: the group theme default applies only if the user has not chosen.
    applyDefault(serverBrand?.themeDefault)
  }, [group, serverBrand, applyDefault])

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
  const plainCover = isNoneCover(appearance.cover)
  const collapsed = rail === 'collapsed'
  const groupRole = group ? formatMembershipRole(group.role) : ''
  const accent = appearance.accent
  // Banner image wins over the gradient/emoji cover (ADR-0054 precedence).
  const headerStyle: CSSProperties = serverBrand?.bannerUrl
    ? {
        backgroundImage: `linear-gradient(rgba(15,23,42,0.45), rgba(15,23,42,0.45)), url(${serverBrand.bannerUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : groupCoverStyle(appearance.cover, appearance.accent)
  const lightHeaderText = serverBrand?.bannerUrl ? true : coverUsesLightText(appearance.cover)

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
      className="min-h-screen bg-canvas font-sans md:flex md:h-screen md:overflow-hidden"
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
              aria-label={collapsed ? t('grupo.ajustes') : undefined}
              title={collapsed ? t('grupo.ajustes') : undefined}
              className={({ isActive }) => railLinkClass(isActive, collapsed)}
            >
              <Settings2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className={cn(collapsed && 'sr-only')}>{t('grupo.ajustes')}</span>
            </NavLink>
          ) : null}
        </div>

        {/* User menu: avatar-only summary that opens the account actions. Sign
            out lives inside the menu so it can't be hit by accident. */}
        {group && user ? (
          <details
            data-testid="rail-user-menu"
            className={cn(
              'relative shrink-0 border-t border-shell-border py-3',
              collapsed ? 'px-2' : 'px-3',
            )}
          >
            <summary
              aria-label={user.displayName ?? t('workspace.account')}
              className={cn(
                'flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg py-1.5 text-shell-foreground transition-colors hover:bg-shell-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary [&::-webkit-details-marker]:hidden',
                collapsed ? 'justify-center px-0' : 'px-2',
              )}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-shell-hover text-sm font-semibold text-shell-foreground"
                aria-hidden="true"
              >
                {(user.displayName ?? '').trim().slice(0, 1).toUpperCase()}
              </span>
              {collapsed ? null : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{user.displayName}</span>
                    <span className="block truncate text-xs text-shell-foreground/60">{groupRole}</span>
                  </span>
                  <ChevronUp className="h-4 w-4 shrink-0 text-shell-foreground/60" aria-hidden="true" />
                </>
              )}
            </summary>
            <nav
              aria-label={t('workspace.account')}
              className={cn(
                'absolute bottom-full z-50 mb-1 space-y-0.5 rounded-xl border border-shell-border bg-surface p-1 text-ink shadow-lg',
                collapsed ? 'left-0 w-56' : 'inset-x-0',
              )}
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
        ) : null}

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

      <div className="flex min-w-0 flex-1 flex-col md:h-screen md:overflow-hidden">
        {group ? (
          <GroupTopBar groupId={group.id} user={user} role={group.role} onLogout={onLogout} />
        ) : null}
        <header className="flex items-center justify-between gap-2 px-4 py-3 md:hidden">
          <Link to="/" className="flex min-h-11 items-center gap-2 no-underline">
            <SonivoMark className="h-7 w-7 text-shell-link" />
            <span className="font-semibold text-shell-foreground">Sonivo</span>
          </Link>
          <div className="flex items-center gap-1">
            {/* Single "Más" lives in the bottom tab bar; the top bar keeps only
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
          {group ? (
            <div className="px-3 pt-3">
              <div
                data-testid="group-bar"
                className="overflow-hidden rounded-2xl"
                style={headerStyle}
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
                        'truncate font-display text-2xl font-semibold tracking-tight md:text-3xl',
                        lightHeaderText ? 'text-white' : 'text-ink',
                      )}
                    >
                      {serverBrand?.displayName ?? group.name}
                    </p>
                    {serverBrand?.tagline ? (
                      <p className={cn('mt-0.5 truncate text-sm', lightHeaderText ? 'text-white/85' : 'text-muted')}>
                        {serverBrand.tagline}
                      </p>
                    ) : (
                      <p className={cn('mt-0.5 text-sm', lightHeaderText ? 'text-white/80' : 'text-muted')}>
                        {formatMembershipRole(group.role)}
                      </p>
                    )}
                    {serverBrand?.verse ? (
                      <p className={cn('mt-1 truncate text-xs italic', lightHeaderText ? 'text-white/70' : 'text-muted')}>
                        {serverBrand.verse}
                      </p>
                    ) : null}
                  </div>
                  {members && members.length > 0 ? (
                    <div className="hidden items-center gap-2 sm:flex">
                      <div className="flex -space-x-2" aria-hidden="true">
                        {members.slice(0, 4).map((member) => (
                          <span
                            key={member.userId}
                            className="grid h-8 w-8 place-items-center rounded-full border-2 border-black/10 bg-primary-strong text-[11px] font-bold text-primary-foreground"
                          >
                            {member.displayName.trim().slice(0, 1).toUpperCase()}
                          </span>
                        ))}
                      </div>
                      <span className={cn('text-xs font-medium', lightHeaderText ? 'text-white/85' : 'text-muted')}>
                        {plural(members.length, t('grupo.memberOne'), t('grupo.memberMany'))}
                      </span>
                    </div>
                  ) : null}
                  <Link
                    to={`/groups/${group.id}/ajustes`}
                    className={cn(
                      'hidden min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium no-underline focus-visible:outline-2 focus-visible:outline-offset-2 md:inline-flex',
                      lightHeaderText
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
                className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary md:hidden"
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
                {t('grupo.ajustes')}
              </Link>
            </div>
          ) : null}

          <div className="flex min-w-0 flex-1">
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
            {group ? (
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
                    {t('grupo.ajustes')}
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
