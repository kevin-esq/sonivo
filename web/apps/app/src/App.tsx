import { useCallback, useEffect, useMemo, useState } from "react";
import type { CurrentUser } from "./api/client";
import { fetchCurrentUser, logoutUser, startHandoff } from "./api/client";
import { AudioPlayerProvider } from "./repertoire/AudioPlayerContext";
import { installGlobalErrorHandlers } from "./diagnostics/clientTelemetry";
import { appHost, isApexHost, tenantSlugFromHost } from "./tenancy/tenantHost";
import { RailPresenceProvider } from "./shell/railPresence";
import { ToastProvider } from "./ui/toast";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { routes } from "./routing/routes";
import { AppRouter, AuthenticatedPlayer } from "./AppRouter";
import type { SessionState } from "./AppRouter";

// ---------- App ----------
export default function App() {
  const [session, setSession] = useState<SessionState>({ status: "loading" });

  const loadSession = useCallback(async (signal?: { cancelled: boolean }) => {
    setSession({ status: "loading" });
    try {
      const current = await fetchCurrentUser();
      if (signal?.cancelled) return;
      setSession(
        current
          ? { status: "authenticated", user: current }
          : { status: "guest" },
      );
    } catch {
      if (!signal?.cancelled) setSession({ status: "error" }); // no longer gets stuck
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    void loadSession(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [loadSession]);

  // Observability: capture uncaught errors and unhandled rejections once per session.
  useEffect(() => installGlobalErrorHandlers(), []);

  // Host-based tenancy (ADR-0067): a request on `{slug}.sonivo.lat` forwards to
  // the existing path resolver, which verifies membership server-side. The slug
  // from the Host header is a SELECTOR, never authorization.
  useEffect(() => {
    const slug = tenantSlugFromHost(window.location.hostname);
    if (!slug) return;
    const { pathname, search } = window.location;
    if (pathname.startsWith(`${routes.app}/g/`) || pathname === routes.handoff || pathname === "/session/handoff") return;
    if (pathname === routes.auth || (pathname.startsWith(`${routes.auth}/`) && pathname !== routes.login)) return;
    if (pathname === routes.app) {
      window.location.replace(`${routes.groupSlug(slug)}${search}`);
      return;
    }
    if (pathname.startsWith(`${routes.app}/`)) return;
    const target = pathname === routes.login || pathname === "/login"
      ? routes.brandedLogin(slug)
      : `${routes.groupSlug(slug)}${pathname === "/" ? "" : pathname}`;
    window.location.replace(`${target}${search}`);
  }, []);

  // Apex -> product entry (ADR-0067 app handoff): when NEXT_PUBLIC_APP_HOST is
  // configured and an authenticated session lands on the apex (or www), exchange
  // a single-use code for a host-only cookie on the app host. Disabled by default
  // so staging and local development are unaffected.
  useEffect(() => {
    if (session.status !== "authenticated") return;
    const target = appHost();
    if (!target || !isApexHost(window.location.hostname)) return;

    // Guard against a redirect loop if the exchange fails.
    const guard = "sonivo:handoff:app";
    try {
      if (window.sessionStorage.getItem(guard) === "1") return;
      window.sessionStorage.setItem(guard, "1");
    } catch {
      // storage unavailable; proceed once
    }

    void startHandoff()
      .then((result) => {
        window.location.replace(result.redirect || `https://${target}${routes.home}`);
      })
      .catch(() => {
        // Stay on the apex; the user can retry by reloading.
      });
  }, [session.status]);

  const onLogout = useCallback(() => {
    void (async () => {
      try {
        await logoutUser();
      } finally {
        setSession({ status: "guest" });
        // Clear sensitive data from memory/cache (React Query, own localStorage, etc.)
      }
    })();
  }, []);

  const onAuthSuccess = useCallback(
    (user: CurrentUser | null) =>
      setSession(
        user ? { status: "authenticated", user } : { status: "guest" },
      ),
    [],
  );

  const user = session.status === "authenticated" ? session.user : null;
  const guestUser = useMemo(
    () => (session.status === "loading" ? undefined : user),
    [session.status, user],
  );

  return (
    <ErrorBoundary>
      <RailPresenceProvider>
        <AudioPlayerProvider>
          <ToastProvider>
            <AppRouter
              session={session}
              user={user}
              guestUser={guestUser}
              onLogout={onLogout}
              onRetry={() => void loadSession()}
              onUserChange={(updatedUser) =>
                setSession({ status: "authenticated", user: updatedUser })
              }
              onAuthSuccess={onAuthSuccess}
            />
          </ToastProvider>
          <AuthenticatedPlayer active={session.status === "authenticated"} />
        </AudioPlayerProvider>
      </RailPresenceProvider>
    </ErrorBoundary>
  );
}
