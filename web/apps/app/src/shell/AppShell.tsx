import { useEffect, useState, type ReactNode } from "react";
import type { CurrentUser } from "../api/client";
import { presenceHeartbeat } from "../api/client";
import { useT } from "../i18n";
import { AppSidebar } from "./AppSidebar";
import { AppTopBar } from "./AppTopBar";
import { AppBottomNav } from "./AppBottomNav";

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

  // ADR-0055 W-E: best-effort presence heartbeat (throttled server-side, never authorizes).
  useEffect(() => {
    async function beat() {
      try {
        await presenceHeartbeat();
      } catch {
        // best-effort; ignore network errors
      }
    }
    void beat();
    const timer = setInterval(() => {
      void beat();
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-canvas lg:flex lg:h-screen lg:overflow-hidden">
      <AppSidebar
        user={user}
        onLogout={onLogout}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-lg"
        >
          {t("a11y.skipToContent")}
        </a>
        <AppTopBar user={user} onOpenMenu={() => setMenuOpen(true)} />
        <main
          id="main"
          className="flex-1 overflow-y-auto px-4 pt-6 pb-24 text-ink sm:px-6 lg:min-h-0 lg:px-8 lg:py-8"
        >
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
      <AppBottomNav onOpenMenu={() => setMenuOpen(true)} />
    </div>
  );
}
