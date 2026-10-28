import { useEffect, useState, type ReactNode } from "react";
import type { CurrentUser } from "../api/client";
import { presenceHeartbeat } from "../api/client";
import { useT } from "../i18n";
import { AppSidebar } from "./AppSidebar";
import { AppTopBar } from "./AppTopBar";
import { useAudioPlayer } from "../repertoire/AudioPlayerContext";
import { AppNavigationProvider, type NavigationMode } from '../routing/AppLink'
import { useDesktopSidebar } from './useDesktopSidebar'

/**
 * Shell for the signed-in, non-group routes (ADR-0053): persistent left sidebar
 * + top bar (search, account notifications, user avatar). The group
 * workspace keeps its own rail (`GroupWorkspace`).
 */
export function AppShell({
  user,
  onLogout,
  children,
  navigationMode = 'legacy',
}: {
  user: CurrentUser;
  onLogout: () => void;
  children: ReactNode;
  navigationMode?: NavigationMode;
}) {
  const { t } = useT();
  const { currentTrack } = useAudioPlayer();
  const sidebar = useDesktopSidebar();
  const [searchOpen, setSearchOpen] = useState(false);


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
    <AppNavigationProvider mode={navigationMode}>
    <div className="app-shell flex min-h-screen flex-col bg-shell lg:h-screen lg:overflow-hidden">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-lg"
        >
          {t("a11y.skipToContent")}
        </a>
      <AppTopBar
        user={user}
        onLogout={onLogout}
        pinned={sidebar.pinned}
        onToggleSidebar={sidebar.toggle}
        searchOpen={searchOpen}
        onSearchOpenChange={setSearchOpen}
        navigationMode={navigationMode}
      />
      <div className="flex min-h-0 flex-1">
      <AppSidebar
        user={user}
        onLogout={onLogout}
        navigationMode={navigationMode}
        sidebar={sidebar}
      />
      <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
        <main
          id="main"
          className={`app-shell__main flex-1 overflow-y-auto bg-canvas px-4 pt-6 text-ink sm:px-6 lg:min-h-0 lg:rounded-tl-2xl lg:px-8 lg:pt-8 ${currentTrack ? "pb-[calc(10rem+env(safe-area-inset-bottom))] lg:pb-32" : "pb-8"}`}
        >
          <div className="app-shell__page mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
      </div>
    </div>
    </AppNavigationProvider>
  );
}
