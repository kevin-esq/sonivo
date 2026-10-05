import { NavLink } from "react-router-dom";
import { CalendarDays, Home, Menu, Search } from "lucide-react";
import { useT } from "../i18n";
import { cn } from "../ui/cn";
import { GLOBAL_SEARCH_INPUT_ID } from "./GlobalSearch";

const itemClass =
  "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 px-2 py-2.5 text-[11px] font-medium no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary motion-reduce:transition-none";

/** Mobile bottom navigation for the app shell (ADR-0053 addendum). */
export function AppBottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { t } = useT();
  return (
    <nav
      aria-label={t("app.sections")}
      data-testid="app-bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-shell-border bg-shell lg:hidden"
    >
      <ul className="grid grid-cols-4">
        <li className="flex">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              cn(itemClass, isActive ? "text-shell-foreground" : "text-shell-foreground/70")
            }
          >
            <Home className="h-5 w-5" aria-hidden="true" />
            {t("sidebar.home")}
          </NavLink>
        </li>
        <li className="flex">
          <NavLink
            to="/calendario"
            className={({ isActive }) =>
              cn(itemClass, isActive ? "text-shell-foreground" : "text-shell-foreground/70")
            }
          >
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
            {t("calendario.title")}
          </NavLink>
        </li>
        <li className="flex">
          <button
            type="button"
            onClick={() =>
              document.getElementById(GLOBAL_SEARCH_INPUT_ID)?.focus()
            }
            className={cn(itemClass, "text-shell-foreground/70")}
          >
            <Search className="h-5 w-5" aria-hidden="true" />
            {t("app.searchLabel")}
          </button>
        </li>
        <li className="flex">
          <button
            type="button"
            onClick={onOpenMenu}
            className={cn(itemClass, "text-shell-foreground/70")}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            {t("workspace.more")}
          </button>
        </li>
      </ul>
    </nav>
  );
}
