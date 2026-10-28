import { routes } from '../routing/routes'
import { LogOut } from "lucide-react";
import type { CurrentUser } from "../api/client";
import { useT } from "../i18n";
import { cn } from "../ui/cn";
import { sidebarSections } from "./navSections";
import { AppLink, AppNavLink, type NavigationMode } from '../routing/AppLink'
import type { useDesktopSidebar } from './useDesktopSidebar'
import { SidebarSectionHeading } from './SidebarSectionHeading'

function initialsOf(user: CurrentUser): string {
  const source = user.displayName?.trim() || user.email?.trim() || "?";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function linkClass(isActive: boolean): string {
  return cn(
    "flex min-h-11 items-center rounded-xl text-sm font-medium no-underline transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary motion-reduce:transition-none",
    "gap-3 px-3",
    isActive
      ? "bg-shell-hover text-shell-foreground"
      : "text-shell-foreground/70 hover:bg-shell-hover hover:text-shell-foreground",
  );
}

function SidebarBody({
  user,
  onLogout,
  collapsed,
  navigationMode,
}: {
  user: CurrentUser;
  onLogout: () => void;
  collapsed: boolean;
  navigationMode: NavigationMode;
}) {
  const { t } = useT();
  const name = user.displayName?.trim() || user.email || t("app.userCard");

  return (
    <>
      <nav
        aria-label={t("app.sections")}
        id="account-sidebar-navigation"
        className={cn(
          "no-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-3",
          "px-3",
        )}
      >
        {sidebarSections.map((section) => (
          <div key={section.id} className="space-y-1">
            {section.labelKey ? (
              <SidebarSectionHeading label={t(section.labelKey)} />
            ) : null}
            {section.items.map((item) => (
                <AppNavLink
                  mode={navigationMode}
                  key={item.id}
                  to={item.to}
                  end={item.end}
                  data-testid={`nav-${item.id}`}
                  aria-label={collapsed ? t(item.labelKey) : undefined}
                  title={collapsed ? t(item.labelKey) : undefined}
                  className={({ isActive }) => linkClass(isActive)}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="desktop-sidebar__label whitespace-nowrap">
                    {t(item.labelKey)}
                  </span>
                </AppNavLink>
              ))}
          </div>
        ))}
      </nav>

      <div
        className={cn(
          "desktop-sidebar__footer shrink-0 space-y-2 border-t border-shell-border py-4",
          "px-3",
        )}
      >
        <AppLink
          mode={navigationMode}
          to={routes.account}
          data-testid="nav-user-card"
          aria-label={collapsed ? name : undefined}
          title={collapsed ? name : undefined}
          className={cn(
            "flex min-h-11 items-center rounded-xl text-shell-foreground no-underline hover:bg-shell-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
            "gap-3 px-2 py-2",
          )}
        >
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-strong text-xs font-bold text-primary-foreground"
            aria-hidden="true"
          >
            {initialsOf(user)}
          </span>
          <span className="desktop-sidebar__label min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{name}</span>
              {user.email ? (
                <span className="block truncate text-xs text-shell-foreground/60">
                  {user.email}
                </span>
              ) : null}
          </span>
        </AppLink>
        <button
          type="button"
          onClick={onLogout}
          data-testid="sidebar-logout"
          aria-label={collapsed ? t("chrome.logout") : undefined}
          title={collapsed ? t("chrome.logout") : undefined}
          className={cn(
            "flex min-h-11 w-full items-center rounded-xl text-sm font-medium text-shell-foreground/70 hover:bg-shell-hover hover:text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
            "gap-3 px-3",
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="desktop-sidebar__label whitespace-nowrap">{t("chrome.logout")}</span>
        </button>
      </div>
    </>
  );
}

export function AppSidebar({
  user,
  onLogout,
  navigationMode = 'legacy',
  sidebar,
}: {
  user: CurrentUser;
  onLogout: () => void;
  navigationMode?: NavigationMode;
  sidebar: ReturnType<typeof useDesktopSidebar>;
}) {
  return (
    <>
      <div className="desktop-sidebar-slot hidden lg:block" data-pinned={sidebar.pinned}>
        <aside
          data-testid="app-sidebar"
          data-collapsed={!sidebar.expanded}
          data-pinned={sidebar.pinned}
          {...sidebar.interactionProps}
          className="desktop-sidebar bg-shell text-shell-foreground"
        >
          <SidebarBody
            user={user}
            onLogout={onLogout}
            collapsed={!sidebar.expanded}
            navigationMode={navigationMode}
          />
        </aside>
      </div>

    </>
  );
}
