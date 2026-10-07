import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CSSProperties, ErrorInfo, ReactNode } from "react";
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { Compass, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import {
  createInvitation,
  deleteGroup,
  fetchCurrentUser,
  leaveGroup,
  logoutUser,
  startHandoff,
  updateGroup,
  type CurrentUser,
} from "./api/client";
import type { GroupsPageActions } from "./groups/GroupsPage";
import {
  AudioPlayerProvider,
  useAudioPlayer,
} from "./repertoire/AudioPlayerContext";
import { BrandLockup } from "./brand/SonivoMark";
import { GuestAuthRoute } from "./shell/AuthScreen";
import { PublicChrome, SessionScreen } from "./shell/GroupsChrome";
import { AppShell } from "./shell/AppShell";
import { useAuth, type AuthContext } from "./shell/authContext";
import { GroupWorkspace } from "./shell/GroupWorkspace";
import { GroupSlugResolver } from "./tenancy/GroupSlugResolver";
import { tenantSlugFromHost, appHost, isApexHost } from "./tenancy/tenantHost";
import { BrandedLoginPage } from "./shell/BrandedLoginPage";
import { MustChangePassword } from "./shell/MustChangePassword";
import { RailPresenceProvider } from "./shell/railPresence";
import { PersistentGlobalPlayer } from "./shell/PersistentGlobalPlayer";
import { Button, primaryButtonClass } from "./ui/button";
import { cn } from "./ui/cn";
import { ToastProvider } from "./ui/toast";
import { PageSkeleton } from "./ui/skeleton";
import { useTheme } from "./brand/theme";
import { brandTokenStyle, readCachedBranding } from "./shell/serverBranding";
import { readGroupAppearance } from "./shell/groupAccent";
import { installGlobalErrorHandlers, reportClientError } from "./diagnostics/clientTelemetry";
import { useT } from "./i18n";

// ---------- Lazy loading (less initial JS) ----------
const named = <T extends Record<string, any>, K extends keyof T>(
  loader: () => Promise<T>,
  key: K,
) => lazy(() => loader().then((m) => ({ default: m[key] })));

const HomePage = named(() => import("./home/HomePage"), "HomePage");
const GroupsPage = named(() => import("./groups/GroupsPage"), "GroupsPage");
const MarketingPage = named(
  () => import("./marketing/MarketingPage"),
  "MarketingPage",
);
const JoinGroupPage = named(
  () => import("./tenancy/JoinGroupPage"),
  "JoinGroupPage",
);
const PlaceholderPage = named(
  () => import("./shell/PlaceholderPage"),
  "PlaceholderPage",
);
const PlansPage = named(() => import("./plans/PlansPage"), "PlansPage");
const CalendarPage = named(
  () => import("./calendar/CalendarPage"),
  "CalendarPage",
);
const GroupHomePage = named(
  () => import("./groups/GroupHomePage"),
  "GroupHomePage",
);
const LibraryPage = named(
  () => import("./repertoire/LibraryPage"),
  "LibraryPage",
);
const SongDetailPage = named(
  () => import("./repertoire/SongDetailPage"),
  "SongDetailPage",
);
const ArrangementDetailPage = named(
  () => import("./repertoire/ArrangementDetailPage"),
  "ArrangementDetailPage",
);
const PracticePage = named(
  () => import("./repertoire/PracticePage"),
  "PracticePage",
);
const SetlistListPage = named(
  () => import("./scheduling/SetlistListPage"),
  "SetlistListPage",
);
const SetlistDetailPage = named(
  () => import("./scheduling/SetlistDetailPage"),
  "SetlistDetailPage",
);
const EventListPage = named(
  () => import("./scheduling/EventListPage"),
  "EventListPage",
);
const EventDetailPage = named(
  () => import("./scheduling/EventDetailPage"),
  "EventDetailPage",
);
const PeoplePage = named(() => import("./tenancy/PeoplePage"), "PeoplePage");
const JoinPage = named(() => import("./tenancy/JoinPage"), "JoinPage");
const HandoffPage = named(() => import("./tenancy/HandoffPage"), "HandoffPage");
const GroupSettingsPage = named(
  () => import("./shell/GroupSettingsPage"),
  "GroupSettingsPage",
);
const GroupCalendarPage = named(
  () => import("./groups/GroupCalendarPage"),
  "GroupCalendarPage",
);
const GroupTasksPage = named(() => import("./groups/GroupTasksPage"), "GroupTasksPage");
const GroupRolesPage = named(() => import("./groups/GroupRolesPage"), "GroupRolesPage");
const GroupResourcesPage = named(
  () => import("./groups/GroupResourcesPage"),
  "GroupResourcesPage",
);
const SecurityPage = named(
  () => import("./shell/SecurityPage"),
  "SecurityPage",
);
const ConfirmPage = named(() => import("./shell/VerifyPages"), "ConfirmPage");
const ForgotPasswordPage = named(
  () => import("./shell/VerifyPages"),
  "ForgotPasswordPage",
);
const ResetPasswordPage = named(
  () => import("./shell/VerifyPages"),
  "ResetPasswordPage",
);
const SettingsProfilePage = named(
  () => import("./shell/settings/SettingsPages"),
  "SettingsProfilePage",
);
const CuentaPreferencesPage = named(
  () => import("./shell/UserChrome"),
  "CuentaPreferencesPage",
);
const SettingsMembershipPage = named(
  () => import("./shell/settings/SettingsPages"),
  "SettingsMembershipPage",
);

// ---------- Session state ----------
type SessionState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "guest" }
  | { status: "authenticated"; user: CurrentUser };

// ---------- Utilities ----------

function RouteFallback() {
  // Route-level loading uses the shared skeleton (Wave C, Step 4) instead of a
  // bare "Loading…" screen, so the transition reads as content arriving.
  //
  // Group routes render OUTSIDE the group shell at this point (the shell chunk is
  // still loading), so we re-apply the group's brand tokens from the local cache
  // and mirror the shell layout — otherwise the group tab flashes a generic,
  // account-themed skeleton that does not match the group's colour.
  const location = useLocation();
  const { theme } = useTheme();
  const groupMatch = location.pathname.match(/^\/groups\/([^/]+)/);
  const groupId = groupMatch ? decodeURIComponent(groupMatch[1]!) : null;

  if (groupId) {
    const cached = readCachedBranding(groupId);
    const accent = cached?.accentHex ?? readGroupAppearance(groupId).accent;
    const tokens = brandTokenStyle(cached, {
      primary: accent,
      theme,
    }) as CSSProperties;
    return (
      <div className="min-h-screen bg-canvas text-ink" style={tokens}>
        <GroupShellSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas px-6 py-10">
      <div className="mx-auto w-full max-w-4xl">
        <PageSkeleton />
      </div>
    </div>
  );
}

/** Shell-shaped skeleton that follows the active group's brand tokens. */
function GroupShellSkeleton() {
  const { t } = useT();
  const label = t("state.loading");
  return (
    <div
      className="min-h-screen md:flex md:min-h-0 md:h-screen md:overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      <aside className="hidden w-60 shrink-0 flex-col gap-2 border-r border-shell-border bg-shell p-4 md:flex">
        <div className="mb-3 h-11 animate-pulse rounded-xl bg-shell-hover motion-reduce:animate-none" />
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-9 animate-pulse rounded-lg bg-shell-hover motion-reduce:animate-none" />
        ))}
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
          <div className="h-10 flex-1 animate-pulse rounded-xl bg-surface-hover/80 motion-reduce:animate-none" />
          <div className="hidden h-10 w-40 animate-pulse rounded-xl bg-surface-hover/80 motion-reduce:animate-none sm:block" />
          <div className="h-10 w-10 animate-pulse rounded-full bg-surface-hover/80 motion-reduce:animate-none" />
        </div>
        <div className="space-y-4 p-4 md:p-6">
          <div className="h-36 animate-pulse rounded-2xl bg-surface-hover/80 motion-reduce:animate-none" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-hover/80 motion-reduce:animate-none" />
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-hover/80 motion-reduce:animate-none" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Shared designed treatment for the 404 and the error fallbacks: brand lockup,
 * icon, title, message and the page's primary action, on the canvas surface.
 */
function FallbackScreen({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  action: ReactNode;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-6 py-10">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-surface p-8 text-center text-ink shadow-sm">
        <div className="flex justify-center">
          <BrandLockup to="/" />
        </div>
        <span
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-shell-link"
          aria-hidden="true"
        >
          <Icon className="h-7 w-7" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {title}
          </h1>
          <p className="text-sm text-muted">{message}</p>
        </div>
        <div className="flex justify-center">{action}</div>
      </div>
    </div>
  );
}

function ErrorFallback() {
  const { t } = useT();
  return (
    <div role="alert">
      <FallbackScreen
        icon={TriangleAlert}
        title={t("state.errorTitle")}
        message={t("state.errorBody")}
        action={
          <Button onClick={() => window.location.reload()}>
            {t("state.reload")}
          </Button>
        }
      />
    </div>
  );
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error:", error, info.componentStack);
    reportClientError({
      source: "react",
      message: error.message || String(error),
      stack: error.stack,
    });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <ErrorFallback />;
  }
}

function NotFoundPage() {
  const { t } = useT();
  return (
    <FallbackScreen
      icon={Compass}
      title={t("state.notFoundTitle")}
      message={t("state.notFoundBody")}
      action={
        <Link to="/" className={cn(primaryButtonClass, "no-underline")}>
          {t("state.backHome")}
        </Link>
      }
    />
  );
}

// ---------- Route layouts ----------
function RequireAuth({
  session,
  onLogout,
  onRetry,
  onUserChange,
}: {
  session: SessionState;
  onLogout: () => void;
  onRetry: () => void;
  onUserChange: (user: CurrentUser) => void;
}) {
  const location = useLocation();
  const { t } = useT();

  if (session.status === "loading")
    return <SessionScreen message={t("state.checkingSession")} />;

  if (session.status === "error") {
    return (
      <div role="alert">
        <FallbackScreen
          icon={WifiOff}
          title={t("state.offlineTitle")}
          message={t("state.offlineBody")}
          action={<Button onClick={onRetry}>{t("state.retry")}</Button>}
        />
      </div>
    );
  }

  if (session.status === "guest") {
    // Remember the route so we can return after login
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  // ADR-0047: a temporary credential blocks the whole app until replaced.
  if (session.user.mustChangePassword) {
    return <MustChangePassword onDone={onRetry} />;
  }

  const context: AuthContext = {
    user: session.user,
    onLogout,
    onUserChange,
  };
  return <Outlet context={context} />;
}

function AppLayout() {
  const ctx = useAuth();
  return (
    <AppShell user={ctx.user} onLogout={ctx.onLogout}>
      <Outlet context={ctx} />
    </AppShell>
  );
}

function GroupLayout() {
  const ctx = useAuth();
  return (
    <GroupWorkspace user={ctx.user} onLogout={ctx.onLogout}>
      <Outlet context={ctx} />
    </GroupWorkspace>
  );
}

// Wrappers that inject `user` without using `!`
const withUser = (Page: React.ComponentType<{ user: CurrentUser }>) =>
  function Wrapped() {
    return <Page user={useAuth().user} />;
  };

/** Real GroupsPage actions; all reject when the backend fails. */
const groupsPageActions: GroupsPageActions = {
  onRename: async (group, name) => {
    await updateGroup(group.id, { name, expectedVersion: group.version });
  },
  onDelete: async (group) => {
    await deleteGroup(group.id, group.version);
  },
  onLeave: async (group) => {
    await leaveGroup(group.id);
  },
  onCreateInvite: async (group) => {
    const invitation = await createInvitation(group.id);
    return `${window.location.origin}/join/${invitation.token}`;
  },
};

/** GroupsPage with user and actions; the page refreshes its own list after each action. */
function GroupsPageWithActions() {
  return <GroupsPage user={useAuth().user} actions={groupsPageActions} />;
}

const HomePageR = withUser(HomePage);
const GroupHomePageR = withUser(GroupHomePage);
const LibraryPageR = withUser(LibraryPage);
const SetlistListPageR = withUser(SetlistListPage);
const SetlistDetailPageR = withUser(SetlistDetailPage);
const EventListPageR = withUser(EventListPage);
const EventDetailPageR = withUser(EventDetailPage);
const PeoplePageR = withUser(PeoplePage);
const SongDetailPageR = withUser(SongDetailPage);
const ArrangementDetailPageR = withUser(ArrangementDetailPage);
const PracticePageR = withUser(PracticePage);
const GroupSettingsPageR = withUser(GroupSettingsPage);

/** The player only exists with an active session. */
function AuthenticatedPlayer({ active }: { active: boolean }) {
  const { closeTrack } = useAudioPlayer();
  useEffect(() => {
    if (!active) closeTrack(); // stops audio on logout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]); // only on session change (closeTrack changes identity)
  return active ? <PersistentGlobalPlayer /> : null;
}

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
    if (pathname.startsWith("/g/") || pathname === "/session/handoff") return;
    window.location.replace(`/g/${slug}${pathname}${search}`);
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
        window.location.replace(result.redirect || `https://${target}/`);
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
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Protected routes */}
              <Route
                element={
                  <RequireAuth
                    session={session}
                    onLogout={onLogout}
                    onRetry={() => void loadSession()}
                    onUserChange={(user) =>
                      setSession({ status: "authenticated", user })
                    }
                  />
                }
              >
                <Route element={<AppLayout />}>
                  <Route path="/" element={<HomePageR />} />
                  <Route path="/grupos" element={<GroupsPageWithActions />} />
                  <Route path="/unirse" element={<JoinGroupPage />} />
                  <Route path="/calendario" element={<CalendarPage />} />
                  <Route path="/plan" element={<PlansPage />} />
                  <Route path="/ayuda" element={<PlaceholderPage />} />
                  <Route path="/cuenta" element={<SettingsProfilePage />} />
                  <Route
                    path="/cuenta/preferencias"
                    element={<CuentaPreferencesPage />}
                  />
                  <Route path="/cuenta/seguridad" element={<SecurityPage />} />
                  <Route
                    path="/cuenta/membresia"
                    element={<SettingsMembershipPage />}
                  />
                  <Route
                    path="/cuenta/notificaciones"
                    element={<PlaceholderPage />}
                  />
                  <Route
                    path="/cuenta/grupos"
                    element={<Navigate to="/grupos" replace />}
                  />
                </Route>

                <Route path="/groups/:groupId" element={<GroupLayout />}>
                  <Route index element={<GroupHomePageR />} />
                  <Route path="library" element={<LibraryPageR />} />
                  <Route path="setlists" element={<SetlistListPageR />} />
                  <Route
                    path="setlists/:setlistId"
                    element={<SetlistDetailPageR />}
                  />
                  <Route path="events" element={<EventListPageR />} />
                  <Route
                    path="events/:eventId"
                    element={<EventDetailPageR />}
                  />
                  <Route path="people" element={<PeoplePageR />} />
                  <Route path="calendario" element={<GroupCalendarPage />} />
                  <Route path="tasks" element={<GroupTasksPage />} />
                  <Route path="roles" element={<GroupRolesPage />} />
                  <Route path="recursos" element={<GroupResourcesPage />} />
                  <Route path="archivos" element={<Navigate to="recursos" replace />} />
                  <Route path="songs/:songId" element={<SongDetailPageR />} />
                  <Route
                    path="arrangements/:arrangementId"
                    element={<ArrangementDetailPageR />}
                  />
                  <Route
                    path="arrangements/:arrangementId/practice"
                    element={<PracticePageR />}
                  />
                  <Route path="ajustes" element={<GroupSettingsPageR />} />
                </Route>

                {/* Path tenancy (ADR-0045 D1): /g/{slug} resolves and forwards to the
                    group workspace keeping the sub-path; it requires membership. */}
                <Route path="/g/:slug" element={<GroupSlugResolver />} />
                <Route path="/g/:slug/*" element={<GroupSlugResolver />} />
              </Route>

              {/* Public routes */}
              <Route path="/bienvenido" element={<MarketingPage />} />
              <Route
                path="/join/:token"
                element={
                  <PublicChrome user={user}>
                    <JoinPage user={guestUser} />
                  </PublicChrome>
                }
              />
              <Route
                path="/login"
                element={
                  <GuestAuthRoute
                    user={guestUser}
                    mode="login"
                    onSuccess={onAuthSuccess}
                  />
                }
              />
              <Route
                path="/g/:slug/login"
                element={
                  <BrandedLoginPage user={guestUser} onSuccess={onAuthSuccess} />
                }
              />
              <Route
                path="/register"
                element={
                  <GuestAuthRoute
                    user={guestUser}
                    mode="register"
                    onSuccess={onAuthSuccess}
                  />
                }
              />
              <Route path="/confirm" element={<ConfirmPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              {/* Tenant-host session handoff (ADR-0067): redeems a single-use
                  code for a host-only cookie on `{slug}.sonivo.lat`. */}
              <Route path="/session/handoff" element={<HandoffPage />} />

              {/* Legacy redirects */}
              <Route
                path="/security"
                element={<Navigate to="/cuenta/seguridad" replace />}
              />
              <Route
                path="/settings"
                element={<Navigate to="/cuenta" replace />}
              />
              <Route
                path="/settings/profile"
                element={<Navigate to="/cuenta" replace />}
              />
              <Route
                path="/settings/security"
                element={<Navigate to="/cuenta/seguridad" replace />}
              />
              <Route
                path="/settings/team"
                element={<Navigate to="/cuenta/grupos" replace />}
              />

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          </ToastProvider>
          <AuthenticatedPlayer active={session.status === "authenticated"} />
        </AudioPlayerProvider>
      </RailPresenceProvider>
    </ErrorBoundary>
  );
}
