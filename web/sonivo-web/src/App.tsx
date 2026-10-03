import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ErrorInfo, ReactNode } from "react";
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
import { BrandedLoginPage } from "./shell/BrandedLoginPage";
import { MustChangePassword } from "./shell/MustChangePassword";
import { RailPresenceProvider } from "./shell/railPresence";
import { PersistentGlobalPlayer } from "./shell/PersistentGlobalPlayer";
import { Button, primaryButtonClass } from "./ui/button";
import { cn } from "./ui/cn";
import { ToastProvider } from "./ui/toast";
import { PageSkeleton } from "./ui/skeleton";

// ---------- Lazy loading (menos JS inicial) ----------
const named = <T extends Record<string, any>, K extends keyof T>(
  loader: () => Promise<T>,
  key: K,
) => lazy(() => loader().then((m) => ({ default: m[key] })));

const HomePage = named(() => import("./home/HomePage"), "HomePage");
const GroupsPage = named(() => import("./groups/GroupsPage"), "GroupsPage");
const JoinGroupPage = named(
  () => import("./tenancy/JoinGroupPage"),
  "JoinGroupPage",
);
const PlaceholderPage = named(
  () => import("./shell/PlaceholderPage"),
  "PlaceholderPage",
);
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
const GroupSettingsPage = named(
  () => import("./shell/GroupSettingsPage"),
  "GroupSettingsPage",
);
const GroupCalendarPage = named(
  () => import("./groups/GroupCalendarPage"),
  "GroupCalendarPage",
);
const GroupTasksPage = named(() => import("./groups/GroupStubs"), "GroupTasksPage");
const GroupRolesPage = named(() => import("./groups/GroupStubs"), "GroupRolesPage");
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

// ---------- Estado de sesión ----------
type SessionState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "guest" }
  | { status: "authenticated"; user: CurrentUser };

// ---------- Utilidades ----------

function RouteFallback() {
  // Route-level loading uses the shared skeleton (Wave C, Step 4) instead of a
  // bare "Cargando…" screen, so the transition reads as content arriving.
  return (
    <div className="min-h-screen bg-canvas px-6 py-10">
      <div className="mx-auto w-full max-w-4xl">
        <PageSkeleton />
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

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error:", error, info.componentStack); // conectar a Sentry, etc.
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert">
        <FallbackScreen
          icon={TriangleAlert}
          title="Algo salió mal"
          message="Ocurrió un error inesperado. Puedes recargar la página."
          action={
            <Button onClick={() => window.location.reload()}>Recargar</Button>
          }
        />
      </div>
    );
  }
}

function NotFoundPage() {
  return (
    <FallbackScreen
      icon={Compass}
      title="Página no encontrada"
      message="La dirección que buscas no existe o fue movida."
      action={
        <Link to="/" className={cn(primaryButtonClass, "no-underline")}>
          Volver al inicio
        </Link>
      }
    />
  );
}

// ---------- Layouts de ruta ----------
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

  if (session.status === "loading")
    return <SessionScreen message="Comprobando sesión…" />;

  if (session.status === "error") {
    return (
      <div role="alert">
        <FallbackScreen
          icon={WifiOff}
          title="Sin conexión"
          message="No pudimos verificar tu sesión. Revisa tu conexión."
          action={<Button onClick={onRetry}>Reintentar</Button>}
        />
      </div>
    );
  }

  if (session.status === "guest") {
    // Guardamos la ruta para volver después del login
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

// Wrappers que inyectan `user` sin usar `!`
const withUser = (Page: React.ComponentType<{ user: CurrentUser }>) =>
  function Wrapped() {
    return <Page user={useAuth().user} />;
  };

/** Acciones reales de GroupsPage; todas rechazan si el backend falla. */
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

/** GroupsPage con usuario y acciones; la página refresca su propia lista tras cada acción. */
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

/** El reproductor solo existe con sesión activa. */
function AuthenticatedPlayer({ active }: { active: boolean }) {
  const { closeTrack } = useAudioPlayer();
  useEffect(() => {
    if (!active) closeTrack(); // detiene audio al cerrar sesión
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]); // solo al cambiar de sesión (closeTrack cambia de identidad)
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
      if (!signal?.cancelled) setSession({ status: "error" }); // ya no se queda colgado
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    void loadSession(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [loadSession]);

  const onLogout = useCallback(() => {
    void (async () => {
      try {
        await logoutUser();
      } finally {
        setSession({ status: "guest" });
        // Limpia datos sensibles en memoria/caché (React Query, localStorage propio, etc.)
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
              {/* Rutas protegidas */}
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
                  <Route path="/plan" element={<PlaceholderPage />} />
                  <Route path="/ayuda" element={<PlaceholderPage />} />
                  <Route path="/cuenta" element={<SettingsProfilePage />} />
                  <Route
                    path="/cuenta/preferencias"
                    element={<CuentaPreferencesPage />}
                  />
                  <Route path="/cuenta/seguridad" element={<SecurityPage />} />
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

              {/* Rutas públicas */}
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

              {/* Redirecciones heredadas */}
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
