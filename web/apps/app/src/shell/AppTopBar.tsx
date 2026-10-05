import { Link } from "react-router-dom";
import { Bell, Menu } from "lucide-react";
import type { CurrentUser } from "../api/client";
import { useT } from "../i18n";
import { GlobalSearch } from "./GlobalSearch";

function initialsOf(user: CurrentUser): string {
  const source = user.displayName?.trim() || user.email?.trim() || "?";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function AppTopBar({
  user,
  onOpenMenu,
}: {
  user: CurrentUser;
  onOpenMenu: () => void;
}) {
  const { t } = useT();
  return (
    <header className="sticky top-0 z-30 border-b border-shell-border bg-shell/90 backdrop-blur">
      <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={t("app.openMenu")}
          data-testid="app-menu-button"
          className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-shell-foreground hover:bg-shell-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="mx-auto min-w-0 max-w-xl flex-1">
          <GlobalSearch />
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            disabled
            aria-label={t("app.notifications")}
            title={t("app.comingSoon")}
            data-testid="app-notifications"
            className="grid min-h-11 min-w-11 cursor-not-allowed place-items-center rounded-lg text-shell-foreground/40"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
          </button>
          <Link
            to="/cuenta"
            aria-label={t("app.userMenu")}
            data-testid="app-user-avatar"
            className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full bg-primary-strong text-xs font-bold text-primary-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            {initialsOf(user)}
          </Link>
        </div>
      </div>
    </header>
  );
}
