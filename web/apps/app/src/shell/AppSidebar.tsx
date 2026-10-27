import { routes } from '../routing/routes'
import { useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight, LogOut, X } from "lucide-react";
import type { CurrentUser } from "../api/client";
import { BrandLockup, SonivoMark } from "../brand/SonivoMark";
import { useT } from "../i18n";
import { cn } from "../ui/cn";
import { sidebarSections } from "./navSections";
import { AppLink, AppNavLink, type NavigationMode } from '../routing/AppLink'
import { NextBrandLockup } from '../brand/NextBrandLockup'

/** Shared with `GroupWorkspace`: one persisted rail preference. */
const RAIL_KEY = "sonivo:sidebar";

function readRailState(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function initialsOf(user: CurrentUser): string {
  const source = user.displayName?.trim() || user.email?.trim() || "?";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function linkClass(isActive: boolean, collapsed: boolean): string {
  return cn(
    "flex min-h-11 items-center rounded-xl text-sm font-medium no-underline transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary motion-reduce:transition-none",
    collapsed ? "justify-center px-2" : "gap-3 px-3",
    isActive
      ? "bg-shell-hover text-shell-foreground"
      : "text-shell-foreground/70 hover:bg-shell-hover hover:text-shell-foreground",
  );
}

function SidebarBody({
  user,
  onLogout,
  collapsed,
  onNavigate,
  onToggleCollapse,
  showClose,
  onClose,
  navigationMode,
}: {
  user: CurrentUser;
  onLogout: () => void;
  collapsed: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
  showClose?: boolean;
  onClose?: () => void;
  navigationMode: NavigationMode;
}) {
  const { t } = useT();
  const name = user.displayName?.trim() || user.email || t("app.userCard");

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-4",
          collapsed ? "flex-col" : "justify-between",
        )}
      >
        {collapsed ? (
          <AppLink
            mode={navigationMode}
            to={routes.home}
            aria-label="Sonivo"
            className="grid min-h-11 min-w-11 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            <SonivoMark className="h-7 w-7 text-shell-link" />
          </AppLink>
        ) : (
          navigationMode === 'next'
            ? <NextBrandLockup to={routes.home} />
            : <BrandLockup to={routes.home} shell />
        )}
        {showClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("app.closeMenu")}
            className="grid min-h-11 min-w-11 place-items-center rounded-lg text-shell-foreground/70 hover:bg-shell-hover hover:text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? t("workspace.expandRail") : t("workspace.collapseRail")}
            aria-expanded={!collapsed}
            data-testid="app-sidebar-toggle"
            className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-shell-foreground/70 transition-colors hover:bg-shell-hover hover:text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary motion-reduce:transition-none"
          >
            {collapsed ? (
              <ChevronsRight size={18} aria-hidden="true" />
            ) : (
              <ChevronsLeft size={18} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      <nav
        aria-label={t("app.sections")}
        className={cn(
          "no-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-3",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {sidebarSections.map((section) => (
          <div key={section.id} className="space-y-1">
            {section.labelKey && !collapsed ? (
              <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-shell-foreground/50">
                {t(section.labelKey)}
              </p>
            ) : null}
            {section.items.map((item) => (
                <AppNavLink
                  mode={navigationMode}
                  key={item.id}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  data-testid={`nav-${item.id}`}
                  aria-label={collapsed ? t(item.labelKey) : undefined}
                  title={collapsed ? t(item.labelKey) : undefined}
                  className={({ isActive }) => linkClass(isActive, collapsed)}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className={cn(collapsed && "sr-only")}>
                    {t(item.labelKey)}
                  </span>
                </AppNavLink>
              ))}
          </div>
        ))}
      </nav>

      <div
        className={cn(
          "shrink-0 space-y-2 border-t border-shell-border py-4",
          collapsed ? "px-2" : "px-3",
        )}
      >
        <AppLink
          mode={navigationMode}
          to={routes.account}
          onClick={onNavigate}
          data-testid="nav-user-card"
          aria-label={collapsed ? name : undefined}
          title={collapsed ? name : undefined}
          className={cn(
            "flex min-h-11 items-center rounded-xl text-shell-foreground no-underline hover:bg-shell-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
            collapsed ? "justify-center px-2" : "gap-3 px-2 py-2",
          )}
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-strong text-xs font-bold text-primary-foreground"
            aria-hidden="true"
          >
            {initialsOf(user)}
          </span>
          {!collapsed ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{name}</span>
              {user.email ? (
                <span className="block truncate text-xs text-shell-foreground/60">
                  {user.email}
                </span>
              ) : null}
            </span>
          ) : null}
        </AppLink>
        <button
          type="button"
          onClick={onLogout}
          data-testid="sidebar-logout"
          aria-label={collapsed ? t("chrome.logout") : undefined}
          title={collapsed ? t("chrome.logout") : undefined}
          className={cn(
            "flex min-h-11 w-full items-center rounded-xl text-sm font-medium text-shell-foreground/70 hover:bg-shell-hover hover:text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
            collapsed ? "justify-center px-2" : "gap-3 px-3",
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className={cn(collapsed && "sr-only")}>{t("chrome.logout")}</span>
        </button>
      </div>
    </>
  );
}

export function AppSidebar({
  user,
  onLogout,
  open,
  onClose,
  navigationMode = 'legacy',
}: {
  user: CurrentUser;
  onLogout: () => void;
  open: boolean;
  onClose: () => void;
  navigationMode?: NavigationMode;
}) {
  const [collapsed, setCollapsed] = useState(readRailState);
  const [hovered, setHovered] = useState(false);
  const expanded = !collapsed || hovered;

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, collapsed ? "collapsed" : "expanded");
    } catch {
      // storage unavailable; preference lives in memory only
    }
  }, [collapsed]);

  return (
    <>
      {/* Desktop rail: fixed to the viewport, one accessible instance. */}
      <aside
        data-testid="app-sidebar"
        data-collapsed={expanded ? "false" : "true"}
        data-pinned={collapsed ? "false" : "true"}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setHovered(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setHovered(false);
          }
        }}
        className={cn(
          "hidden shrink-0 flex-col border-r border-shell-border bg-shell text-shell-foreground transition-[width] duration-200 ease-out motion-reduce:transition-none lg:sticky lg:left-0 lg:top-0 lg:z-30 lg:flex lg:h-screen",
          expanded ? "lg:w-64" : "lg:w-[4.5rem]",
        )}
      >
        <SidebarBody
          user={user}
          onLogout={onLogout}
          collapsed={!expanded}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          navigationMode={navigationMode}
        />
      </aside>

      {/* Mobile drawer: always expanded, only mounted while open. */}
      {open ? (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-40 bg-slate-900/40"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside
            data-testid="app-sidebar-mobile"
            className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-shell-border bg-shell text-shell-foreground"
          >
            <SidebarBody
              user={user}
              onLogout={onLogout}
              collapsed={false}
              onNavigate={onClose}
              showClose
              onClose={onClose}
              navigationMode={navigationMode}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
