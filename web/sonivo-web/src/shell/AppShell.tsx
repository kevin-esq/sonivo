import { useState, type ReactNode } from "react";
import type { CurrentUser } from "../api/client";
import { useT } from "../i18n";
import { AppSidebar } from "./AppSidebar";
import { AppTopBar } from "./AppTopBar";

/**
 * Shell for the signed-in, non-group routes (ADR-0053): persistent left sidebar
 * + top bar (search, notifications placeholder, user avatar). The group
 * workspace keeps its own rail (`GroupWorkspace`).
 */
export function AppShell({
  user,
  onLogout,
  children,
}: {
  user: CurrentUser;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { t } = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-canvas lg:flex">
      <AppSidebar
        user={user}
        onLogout={onLogout}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-lg"
        >
          {t("a11y.skipToContent")}
        </a>
        <AppTopBar user={user} onOpenMenu={() => setMenuOpen(true)} />
        <main
          id="main"
          className="flex-1 px-4 py-6 text-ink sm:px-6 lg:px-8 lg:py-8"
        >
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
