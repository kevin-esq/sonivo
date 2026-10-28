import { useEffect, useRef, useState } from "react";
import { CalendarDays, Search, X } from "lucide-react";
import type { CurrentUser } from "../api/client";
import { useT } from "../i18n";
import { routes } from "../routing/routes";
import { GlobalSearch, GLOBAL_SEARCH_INPUT_ID } from "./GlobalSearch";
import { AppLink, type NavigationMode } from '../routing/AppLink'
import { BrandLockup } from '../brand/SonivoMark'
import { NextBrandLockup } from '../brand/NextBrandLockup'
import { ShellHeaderBrand } from './ShellHeaderBrand'
import { MobileSectionNav } from './MobileSectionNav'
import { sidebarSections } from './navSections'
import { cn } from '../ui/cn'
import { MobileMoreMenu } from './MobileMoreMenu'
import { NotificationBell } from '../notifications/NotificationBell'

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
  onLogout,
  pinned,
  onToggleSidebar,
  searchOpen,
  onSearchOpenChange,
  navigationMode = 'legacy',
}: {
  user: CurrentUser;
  onLogout: () => void;
  pinned: boolean;
  onToggleSidebar: () => void;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  navigationMode?: NavigationMode;
}) {
  const { t } = useT();
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  useEffect(() => {
    if (searchOpen) document.getElementById(GLOBAL_SEARCH_INPUT_ID)?.focus();
  }, [searchOpen]);
  return (
    <header className={cn("app-shell-header sticky top-0 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] bg-shell lg:grid-cols-[16rem_minmax(0,1fr)_auto]", searchFocused || notificationsOpen ? "z-[60]" : "z-40")} onKeyDown={(event) => {
      if (event.key === "Escape" && searchOpen) {
        onSearchOpenChange(false);
        searchToggleRef.current?.focus();
      }
    }}>
      <ShellHeaderBrand pinned={pinned} onToggle={onToggleSidebar}>
        {navigationMode === 'next' ? <NextBrandLockup to={routes.home} /> : <BrandLockup to={routes.home} shell />}
      </ShellHeaderBrand>
      <div className="col-start-1 row-start-1 flex h-16 min-w-0 items-center pl-4 lg:hidden" data-testid="app-mobile-brand">
        <BrandLockup to={routes.home} shell />
      </div>
      <div className={cn("relative z-20 col-span-2 min-w-0 px-4 pb-3 pt-1 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:block lg:self-center lg:px-6 lg:py-0", searchOpen ? "block" : "hidden")}>
        <div className="mx-auto max-w-xl">
          <GlobalSearch navigationMode={navigationMode} onFocusChange={(focused) => {
            setSearchFocused(focused);
            if (!focused) onSearchOpenChange(false);
          }} />
        </div>
      </div>
      <div className="relative z-30 col-start-2 row-start-1 flex h-16 shrink-0 items-center gap-1 pr-3 lg:col-start-3 lg:pr-6">
        <button
          ref={searchToggleRef}
          type="button"
          onPointerDown={(event) => { if (searchOpen) event.preventDefault(); }}
          onClick={() => {
            if (searchOpen) document.getElementById(GLOBAL_SEARCH_INPUT_ID)?.blur();
            onSearchOpenChange(!searchOpen);
          }}
          aria-label={t(searchOpen ? "app.closeSearch" : "app.searchLabel")}
          aria-expanded={searchOpen}
          aria-controls={GLOBAL_SEARCH_INPUT_ID}
          data-testid="app-mobile-search-toggle"
          className="grid min-h-11 min-w-11 place-items-center rounded-full text-shell-foreground/80 hover:bg-shell-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary lg:hidden"
        >
          {searchOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Search className="h-5 w-5" aria-hidden="true" />}
        </button>
        <AppLink mode={navigationMode} to={routes.calendar} aria-label={t("calendar.title")} data-testid="app-calendar" className="grid min-h-11 min-w-11 place-items-center rounded-full text-shell-foreground/80 no-underline hover:bg-shell-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
        </AppLink>
        <NotificationBell scope="account" onOpenChange={setNotificationsOpen} />
        <AppLink mode={navigationMode} to={routes.account} aria-label={t("app.userMenu")} data-testid="app-user-avatar" className="grid min-h-11 min-w-11 place-items-center rounded-full bg-primary-strong text-xs font-bold text-primary-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
          {initialsOf(user)}
        </AppLink>
      </div>
      {!searchOpen ? (
        <MobileSectionNav items={sidebarSections[0].items.map((item) => ({ id: item.id, label: t(item.labelKey), icon: item.icon, to: item.to, end: item.end }))} label={t("app.sections")} className="col-span-2 lg:hidden" action={<MobileMoreMenu items={sidebarSections.slice(1).flatMap((section) => section.items).map((item) => ({ id: item.id, label: t(item.labelKey), icon: item.icon, to: item.to, end: item.end }))} onLogout={onLogout} />} />
      ) : null}
    </header>
  );
}
