import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { AppLink, AppNavLink, AppNavigationProvider, type NavigationMode } from '../routing/AppLink'
import { GroupShellProvider } from './GroupShellContext'
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
import { formatMembershipRole } from '../repertoire/ui'
import { cn } from '../ui/cn'
import { readGroupAppearance } from './groupAccent'
import { GROUP_UPDATED_EVENT } from './groupEvents'
import { groupNavSections, mobileQuickItems } from './nav'
import {
  applyDocumentBranding,
  brandTokenStyle,
  loadServerBranding,
  readCachedBranding,
  writeCachedBranding,
  writeCachedTokens,
  type ServerBranding,
} from './serverBranding'
import { useTheme } from '../brand/theme'
import { rememberLastGroup } from '../tenancy/groupSlug'
import { routes } from '../routing/routes'
import { useRailPresence } from './railPresence'
import { BrandPreviewContext, type BrandPreviewDraft } from './brandPreview'
import { useGroupLive } from '../groups/useGroupLive'
import { GroupTopBar } from './GroupTopBar'
import { ShellHeaderBrand } from './ShellHeaderBrand'
import { GroupContextRail } from './GroupContextRail'
import { Button } from '../ui/button'
import { useAudioPlayer } from '../repertoire/AudioPlayerContext'
import { useDesktopSidebar } from './useDesktopSidebar'
import { SidebarSectionHeading } from './SidebarSectionHeading'

function railLinkClass(isActive: boolean): string {
  return cn(
    'flex min-h-11 items-center rounded-xl text-sm font-medium no-underline transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary motion-reduce:transition-none',
    'gap-3 px-3 py-2.5',
    isActive
      ? 'bg-shell-hover text-shell-foreground'
      : 'text-shell-foreground/70 hover:bg-shell-hover hover:text-shell-foreground',
  )
}

export function GroupWorkspace({
  user,
  onLogout,
  groupId,
  pathname,
  search = '',
  navigate,
  navigationMode = 'legacy',
  children,
}: {
  user: CurrentUser
  onLogout: () => void
  groupId: string
  pathname: string
  search?: string
  navigate: (to: string, options?: { replace?: boolean }) => void
  navigationMode?: NavigationMode
  children: React.ReactNode
}) {
  // The context rail (Semana / Hoy / Listas / Tu progreso) is home-only chrome.
  const onGroupHome = pathname === routes.group(groupId) || pathname === `${routes.group(groupId)}/`
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const sidebar = useDesktopSidebar()
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
  // Pending branding edits live at the shell level so route changes keep the preview.
  const [brandPreview, setBrandPreview] = useState<BrandPreviewDraft | null>(null)
  const [savingBrandPreview, setSavingBrandPreview] = useState(false)
  const [brandPreviewError, setBrandPreviewError] = useState<string | null>(null)
  const { t } = useT()
  const { currentTrack } = useAudioPlayer()
  const { setRailPresent, setRailCollapsed, setBrandTokens } = useRailPresence()
  const { theme } = useTheme()

  useEffect(() => {
    setRailPresent(true)
    return () => setRailPresent(false)
  }, [setRailPresent])
  useEffect(() => () => setBrandTokens({}), [setBrandTokens])

  useEffect(() => {
    if (brandPreview) Object.values(brandPreview.pendingImages).forEach((image) => image && URL.revokeObjectURL(image.url))
    setBrandPreview(null)
    setBrandPreviewError(null)
  }, [groupId])

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
        // Unknown (not "off"): keep null so branding is still fetched best-effort.
        if (!cancelled) setBrandingEnabled(null)
      })
    return () => {
      cancelled = true
    }
  }, [])



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
          setError(t('common.groupNotFoundOrNoAccess'))
        } else {
          setError(problemDetail(err, t))
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
    // brandingEnabled === null means the feature flags could not be read; still
    // try (best effort) so a transient flags failure does not drop the colours.
    let cancelled = false
    void loadServerBranding(group.id).then((branding) => {
      if (cancelled) return
      setFetchedBrand({ groupId: group.id, brand: branding })
      // Refresh the cache only on success: a transient request failure must never
      // wipe the saved branding (that caused the default→brand flash on reloads).
      if (branding) writeCachedBranding(group.id, branding)
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
      name: brandPreview?.groupId === group.id && brandPreview.displayName.trim()
        ? brandPreview.displayName.trim()
        : brandPreview?.groupId === group.id
          ? brandPreview.groupName
          : serverBrand?.displayName ?? group.name,
      slug: group.slug ?? null,
      accentHex: serverBrand?.accentHex ?? null,
      logoUrl: serverBrand?.logoUrl ?? null,
    })
  }, [group, serverBrand, brandPreview])

  const deviceAppearance = readGroupAppearance(group?.id)
  const serverCover =
    serverBrand?.coverKind === 'gradient' && serverBrand.coverValue
      ? `gradient:${serverBrand.coverValue}`
      : serverBrand?.coverKind === 'preset' && serverBrand.coverValue
        ? `preset:${serverBrand.coverValue}`
      : serverBrand?.coverKind === 'emoji' && serverBrand.coverValue
        ? serverBrand.coverValue
        : null
  const appearance = serverBrand
    ? { accent: serverBrand.accentHex ?? deviceAppearance.accent, cover: serverCover ?? deviceAppearance.cover }
    : deviceAppearance
  const collapsed = !sidebar.expanded
  // Keep the global player beside the rail while the rail stays navigation-only.
  useEffect(() => setRailCollapsed(!sidebar.pinned), [sidebar.pinned, setRailCollapsed])
  const groupRole = group ? formatMembershipRole(group.role, t) : ''
  const canManageGroup = group?.role === 'Owner'
  const visibleGroupNavSections = groupNavSections.filter(
    (section) => section.id !== 'administration' || canManageGroup,
  )
  const mobileQuickIds = new Set(mobileQuickItems.map((item) => item.id))
  const visibleMobileMoreItems = visibleGroupNavSections.flatMap((section) => section.items)
    .filter((item) => !mobileQuickIds.has(item.id) && item.id !== 'calendar')
  const accent = appearance.accent

  const brandTokens = useMemo(
    () => brandTokenStyle(serverBrand, { primary: accent, theme }),
    [serverBrand, accent, theme],
  )
  useEffect(() => {
    setBrandTokens(brandTokens)
  }, [brandTokens, setBrandTokens])
  // Persist the computed tokens so the pre-paint script can apply them before
  // React mounts on the next visit (no default→brand flash, Gmail-style).
  const tokensJson = useMemo(() => JSON.stringify(brandTokens), [brandTokens])
  useEffect(() => {
    if (groupId) writeCachedTokens(groupId, JSON.parse(tokensJson) as Record<string, string>)
  }, [groupId, tokensJson])

  // The root layout's pre-paint script writes the group tokens onto :root; clear
  // them when the shell unmounts so the group theme never leaks to other routes.
  useEffect(
    () => () => {
      try {
        const root = document.documentElement
        const names: string[] = []
        for (let i = 0; i < root.style.length; i += 1) {
          const name = root.style.item(i)
          if (name.startsWith('--')) names.push(name)
        }
        for (const name of names) root.style.removeProperty(name)
      } catch {
        // best-effort only
      }
    },
    [],
  )
  const shellStyle = {
    ...brandTokens,
    ...(brandPreview && brandPreview.groupId === groupId ? brandPreview.tokens : {}),
    // Liquid-glass accent wash over the canvas (token from deriveGroupThemeTokens).
    backgroundImage: 'var(--brand-wash)',
  } as CSSProperties

  return (
    <AppNavigationProvider mode={navigationMode}>
    <GroupShellProvider value={{ groupId, pathname, search, user, navigate, navigationMode }}>
    <BrandPreviewContext.Provider
      value={{
        draft: brandPreview,
        setDraft: setBrandPreview,
        savedBrand: serverBrand && groupId
          ? {
              groupId,
              accentHex: serverBrand.accentHex,
              displayName: serverBrand.displayName,
              tagline: serverBrand.tagline,
              verse: serverBrand.verse,
              welcomeText: serverBrand.welcomeText,
              cover: serverBrand.coverKind === 'preset' && serverBrand.coverValue
                ? `preset:${serverBrand.coverValue}`
                : serverBrand.coverKind === 'gradient' && serverBrand.coverValue
                  ? `gradient:${serverBrand.coverValue}`
                  : serverBrand.coverKind === 'emoji' && serverBrand.coverValue
                    ? serverBrand.coverValue
                    : 'none',
              bannerUrl: serverBrand.bannerUrl,
            }
          : null,
      }}
    >
    <div
      className="group-workspace min-h-screen bg-canvas font-sans md:fixed md:inset-0 md:flex md:flex-col md:overflow-hidden"
      data-testid="grupo-shell"
      style={shellStyle}
    >
        {group ? (
          <GroupTopBar
            brand={
              <AppLink
                to={routes.group(group.id)}
                data-testid="rail-brand"
                className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-shell-hover text-sm font-semibold text-shell-foreground">
                  {brandPreview?.groupId === group.id && brandPreview.pendingImages.logo ? (
                    <img src={brandPreview.pendingImages.logo.url} alt="" className="h-6 w-6 object-contain" />
                  ) : serverBrand?.logoUrl ? (
                    <img src={serverBrand.logoUrl} alt="" className="h-6 w-6 object-contain" />
                  ) : (
                    group.name.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-lg font-semibold text-shell-foreground md:text-sm">
                    {brandPreview?.groupId === group.id && brandPreview.displayName.trim()
                      ? brandPreview.displayName.trim()
                      : brandPreview?.groupId === group.id
                        ? brandPreview.groupName
                        : serverBrand?.displayName ?? group.name}
                  </span>
                  {(brandPreview?.groupId === group.id ? brandPreview.tagline : serverBrand?.tagline) ? (
                    <span className="hidden truncate text-xs text-shell-foreground/60 md:block">
                      {brandPreview?.groupId === group.id ? brandPreview.tagline : serverBrand?.tagline}
                    </span>
                  ) : (
                    <span className="hidden truncate text-xs text-shell-foreground/60 md:block">{groupRole}</span>
                  )}
                </span>
              </AppLink>
            }
            pinned={sidebar.pinned}
            onToggleSidebar={sidebar.toggle}
            mobileItems={mobileQuickItems
              .map((item) => ({ id: item.id, label: t(item.labelKey), icon: item.icon, to: item.href(group.id), end: item.end }))}
            moreItems={visibleMobileMoreItems.map((item) => ({ id: item.id, label: t(item.labelKey), icon: item.icon, to: item.href(group.id), end: item.end }))}
            groupId={group.id}
            user={user}
            role={group.role}
            onLogout={onLogout}
            navigate={navigate}
          />
        ) : (
          <header className="flex h-16 shrink-0 bg-shell">
            <ShellHeaderBrand group pinned={sidebar.pinned} onToggle={sidebar.toggle}>
              <BrandLockup to={routes.home} shell />
            </ShellHeaderBrand>
          </header>
        )}
      <div className="flex min-h-0 flex-1">
      <div className="desktop-sidebar-slot desktop-sidebar-slot--group hidden md:block" data-pinned={sidebar.pinned}>
      <aside
        className="desktop-sidebar bg-shell text-shell-foreground"
        data-testid="group-rail"
        data-rail={sidebar.pinned ? 'expanded' : 'collapsed'}
        data-pinned={sidebar.pinned}
        data-collapsed={collapsed}
        {...sidebar.interactionProps}
      >
        {group ? (
          <nav
            className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3"
            aria-label={t('workspace.groupNav')}
            id="group-sidebar-navigation"
          >
            {visibleGroupNavSections.map((section) => (
              <div key={section.id} className="space-y-1">
                {section.labelKey ? (
                  <SidebarSectionHeading label={t(section.labelKey)} />
                ) : null}
                {section.items.map((item) => {
                  const Icon = item.icon
                  const label = t(item.labelKey)
                  return (
                    <AppNavLink
                      key={item.id}
                      to={item.href(group.id)}
                      end={item.end}
                      data-testid={item.id === 'settings' ? 'rail-settings' : item.id === 'help' ? 'rail-help' : undefined}
                      aria-label={collapsed ? label : undefined}
                      title={collapsed ? label : undefined}
                      className={({ isActive }) => railLinkClass(isActive)}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="desktop-sidebar__label whitespace-nowrap">{label}</span>
                    </AppNavLink>
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

        {group ? (
          <div className="desktop-sidebar__label shrink-0 border-t border-shell-border px-3 py-2">
            <p className="text-center text-[10px] text-shell-foreground/60">
              {t('workspace.sonivoCredit')}
            </p>
          </div>
        ) : null}
      </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col md:min-h-0 md:overflow-hidden">
        <div
          className="flex flex-1 flex-col md:min-h-0 md:overflow-y-auto"
          data-testid="group-content-scroll"
        >
          <div className="flex min-w-0 flex-1 md:min-h-0">
            <div className="min-w-0 flex-1 md:min-h-0">

              <main
                data-testid="group-content"
        className="group-content-panel m-3 flex-1 rounded-2xl bg-surface text-ink"
              >
              <div className={`px-5 py-6 md:px-8 ${currentTrack ? 'pb-[calc(10rem+env(safe-area-inset-bottom))] md:pb-32' : 'pb-8'}`}>
                {group === null ? (
                  <div className="space-y-3">
                    <p role="alert" className="text-error-ink">
                      {error}
                    </p>
                    <AppLink className="font-semibold text-primary-ink no-underline hover:underline" to={routes.home}>
                      {t('workspace.myGroups')}
                    </AppLink>
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

      </div>

      {group && brandPreview && brandPreview.groupId === group.id && brandPreview.dirty ? (
        <div
          role="status"
          data-testid="brand-unsaved-bar"
          className="fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-shell-border bg-surface px-4 py-3 text-ink shadow-xl md:bottom-4"
        >
          <p className="min-w-0 flex-1 text-sm font-medium">
            {brandPreviewError ?? t('settings.unsavedChanges')}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={savingBrandPreview}
            onClick={() => {
              brandPreview.discard()
              Object.values(brandPreview.pendingImages).forEach((image) => image && URL.revokeObjectURL(image.url))
              setBrandPreview(null)
              setBrandPreviewError(null)
            }}
          >
            {t('settings.discardChanges')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={savingBrandPreview}
            onClick={() => {
              setSavingBrandPreview(true)
              setBrandPreviewError(null)
              void brandPreview.save().then((error) => {
                if (error) setBrandPreviewError(error)
                else setBrandPreview(null)
              }).finally(() => setSavingBrandPreview(false))
            }}
          >
            {savingBrandPreview ? t('settings.saving') : t('settings.saveBranding')}
          </Button>
        </div>
      ) : null}


    </div>
    </BrandPreviewContext.Provider>
    </GroupShellProvider>
    </AppNavigationProvider>
  )
}
