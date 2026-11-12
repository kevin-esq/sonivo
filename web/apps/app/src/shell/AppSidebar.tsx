import { useT } from "../i18n";
import { cn } from "../ui/cn";
import { sidebarSections } from "./navSections";
import { AppNavLink, type NavigationMode } from '../routing/AppLink'
import type { useDesktopSidebar } from './useDesktopSidebar'
import { SidebarSectionHeading } from './SidebarSectionHeading'

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
  collapsed,
  navigationMode,
}: {
  collapsed: boolean;
  navigationMode: NavigationMode;
}) {
  const { t } = useT();

  return (
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
  );
}

export function AppSidebar({
  navigationMode = 'legacy',
  sidebar,
}: {
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
            collapsed={!sidebar.expanded}
            navigationMode={navigationMode}
          />
        </aside>
      </div>

    </>
  );
}
