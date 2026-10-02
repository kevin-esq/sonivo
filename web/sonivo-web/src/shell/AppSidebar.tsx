import { NavLink } from "react-router-dom";
import { LogOut, X } from "lucide-react";
import type { CurrentUser } from "../api/client";
import { BrandLockup } from "../brand/SonivoMark";
import { useT } from "../i18n";
import { cn } from "../ui/cn";
import { sidebarSections, type SidebarItem } from "./navSections";

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
    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium no-underline transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary motion-reduce:transition-none",
    isActive
      ? "bg-shell-hover text-shell-foreground"
      : "text-shell-foreground/70 hover:bg-shell-hover hover:text-shell-foreground",
  );
}

function DisabledItem({ item }: { item: SidebarItem }) {
  const { t } = useT();
  const Icon = item.icon;
  return (
    <span
      aria-disabled="true"
      title={t("app.comingSoon")}
      data-testid={`nav-disabled-${item.id}`}
      className="flex min-h-11 cursor-not-allowed items-center gap-3 rounded-xl px-3 text-sm font-medium text-shell-foreground/40"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
      <span className="shrink-0 rounded-full bg-shell-hover px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-shell-foreground/60">
        {t("app.comingSoon")}
      </span>
    </span>
  );
}

function SidebarBody({
  user,
  onLogout,
  onNavigate,
  showClose,
  onClose,
}: {
  user: CurrentUser;
  onLogout: () => void;
  onNavigate?: () => void;
  showClose?: boolean;
  onClose?: () => void;
}) {
  const { t } = useT();
  const name = user.displayName?.trim() || user.email || t("app.userCard");

  return (
    <>
      <div className="flex items-center justify-between px-4 py-4">
        <BrandLockup to="/" shell />
        {showClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("app.closeMenu")}
            className="grid min-h-11 min-w-11 place-items-center rounded-lg text-shell-foreground/70 hover:bg-shell-hover hover:text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <nav
        aria-label={t("app.sections")}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-3"
      >
        {sidebarSections.map((section) => (
          <div key={section.id} className="space-y-1">
            {section.labelKey ? (
              <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-shell-foreground/50">
                {t(section.labelKey)}
              </p>
            ) : null}
            {section.items.map((item) =>
              item.disabled || !item.to ? (
                <DisabledItem key={item.id} item={item} />
              ) : (
                <NavLink
                  key={item.id}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  data-testid={`nav-${item.id}`}
                  className={({ isActive }) => linkClass(isActive)}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{t(item.labelKey)}</span>
                </NavLink>
              ),
            )}
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-shell-border p-3">
        <NavLink
          to="/cuenta"
          onClick={onNavigate}
          data-testid="nav-user-card"
          className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-2 text-shell-foreground no-underline hover:bg-shell-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
            aria-hidden="true"
          >
            {initialsOf(user)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{name}</span>
            {user.email ? (
              <span className="block truncate text-xs text-shell-foreground/60">
                {user.email}
              </span>
            ) : null}
          </span>
        </NavLink>
        <button
          type="button"
          onClick={onLogout}
          data-testid="sidebar-logout"
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-shell-foreground/70 hover:bg-shell-hover hover:text-shell-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("chrome.logout")}
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
}: {
  user: CurrentUser;
  onLogout: () => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Desktop rail: always present, one accessible instance. */}
      <aside
        data-testid="app-sidebar"
        className="hidden w-64 shrink-0 flex-col border-r border-shell-border bg-shell text-shell-foreground lg:flex"
      >
        <SidebarBody user={user} onLogout={onLogout} />
      </aside>

      {/* Mobile drawer: only mounted while open, so it never duplicates targets. */}
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
              onNavigate={onClose}
              showClose
              onClose={onClose}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
