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
  useOutletContext,
} from "react-router-dom";
import { fetchCurrentUser, logoutUser, type CurrentUser } from "./api/client";
import {
  AudioPlayerProvider,
  useAudioPlayer,
} from "./repertoire/AudioPlayerContext";
import { GuestAuthRoute } from "./shell/AuthScreen";
import {
  GroupsChrome,
  PublicChrome,
  SessionScreen,
} from "./shell/GroupsChrome";
import { GroupWorkspace } from "./shell/GroupWorkspace";
import { PersistentGlobalPlayer } from "./shell/PersistentGlobalPlayer";
import { UserChrome } from "./shell/UserChrome";

// ---------- Lazy loading (menos JS inicial) ----------
const named = <T extends Record<string, any>, K extends keyof T>(
  loader: () => Promise<T>,
  key: K,
) => lazy(() => loader().then((m) => ({ default: m[key] })));

const GroupsPage = named(() => import("./groups/GroupsPage"), "GroupsPage");
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

type AuthContext = { user: CurrentUser; onLogout: () => void };

/** Sustituye todos los `user!`: los hijos leen el usuario ya validado. */
function useAuth() {
  return useOutletContext<AuthContext>();
}

// ---------- Utilidades ----------

function RouteFallback() {
  return <SessionScreen message="Cargando…" />;
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
      <div role="alert" style={{ padding: 32, textAlign: "center" }}>
        <h1>Algo salió mal</h1>
        <p>Ocurrió un error inesperado. Puedes recargar la página.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Recargar
        </button>
      </div>
    );
  }
}

function NotFoundPage() {
  return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <h1>Página no encontrada</h1>
      <p>La dirección que buscas no existe o fue movida.</p>
      <Link to="/">Volver al inicio</Link>
    </div>
  );
}

// ---------- Layouts de ruta ----------
function RequireAuth({
  session,
  onLogout,
  onRetry,
}: {
  session: SessionState;
  onLogout: () => void;
  onRetry: () => void;
}) {
  const location = useLocation();

  if (session.status === "loading")
    return <SessionScreen message="Comprobando sesión…" />;

  if (session.status === "error") {
    return (
      <div role="alert" style={{ padding: 32, textAlign: "center" }}>
        <p>No pudimos verificar tu sesión. Revisa tu conexión.</p>
        <button type="button" onClick={onRetry}>
          Reintentar
        </button>
      </div>
    );
  }

  if (session.status === "guest") {
    // Guardamos la ruta para volver después del login
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  const context: AuthContext = { user: session.user, onLogout };
  return <Outlet context={context} />;
}

function GroupsLayout() {
  const ctx = useAuth();
  return (
    <GroupsChrome user={ctx.user} onLogout={ctx.onLogout}>
      <Outlet context={ctx} />
    </GroupsChrome>
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

function AccountLayout() {
  const ctx = useAuth();
  return (
    <UserChrome user={ctx.user} onLogout={ctx.onLogout}>
      <Outlet context={ctx} />
    </UserChrome>
  );
}

// Wrappers que inyectan `user` sin usar `!`
const withUser = (Page: React.ComponentType<{ user: CurrentUser }>) =>
  function Wrapped() {
    return <Page user={useAuth().user} />;
  };

const GroupsPageR = withUser(GroupsPage);
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
const SettingsProfilePageR = withUser(SettingsProfilePage);

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
      <AudioPlayerProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Rutas protegidas */}
            <Route
              element={
                <RequireAuth
                  session={session}
                  onLogout={onLogout}
                  onRetry={() => void loadSession()}
                />
              }
            >
              <Route element={<GroupsLayout />}>
                <Route path="/" element={<GroupsPageR />} />
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
                <Route path="events/:eventId" element={<EventDetailPageR />} />
                <Route path="people" element={<PeoplePageR />} />
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

              <Route path="/cuenta" element={<AccountLayout />}>
                <Route index element={<SettingsProfilePageR />} />
                <Route
                  path="preferencias"
                  element={<CuentaPreferencesPage />}
                />
                <Route path="seguridad" element={<SecurityPage />} />
                <Route path="grupos" element={<GroupsPageR />} />
              </Route>
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
        <AuthenticatedPlayer active={session.status === "authenticated"} />
      </AudioPlayerProvider>
    </ErrorBoundary>
  );
}
