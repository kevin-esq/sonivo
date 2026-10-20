import {
  Suspense,
  lazy,
  useEffect,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { Compass, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import {
  createInvitation,
  deleteGroup,
  leaveGroup,
  updateGroup,
  type CurrentUser,
} from "./api/client";
import type { GroupsPageActions } from "./groups/GroupsPage";
import { useAudioPlayer } from "./repertoire/AudioPlayerContext";
import { BrandLockup } from "./brand/SonivoMark";
import { GuestAuthRoute } from "./shell/AuthScreen";
import { PublicChrome, SessionScreen } from "./shell/GroupsChrome";
import { AppShell } from "./shell/AppShell";
import { useAuth, type AuthContext } from "./shell/authContext";
import { GroupWorkspace } from "./shell/GroupWorkspace";
import { GroupSlugResolver } from "./tenancy/GroupSlugResolver";
import { BrandedLoginPage } from "./shell/BrandedLoginPage";
import { MustChangePassword } from "./shell/MustChangePassword";
import { PersistentGlobalPlayer } from "./shell/PersistentGlobalPlayer";
import { Button, primaryButtonClass } from "./ui/button";
import { cn } from "./ui/cn";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { PageSkeleton } from "./ui/skeleton";
import { useTheme } from "./brand/theme";
import { brandTokenStyle, readCachedBranding } from "./shell/serverBranding";
import { readGroupAppearance } from "./shell/groupAccent";
import { useT } from "./i18n";
import { legacyGroupRouteRedirects, legacyRouteRedirects, routes } from "./routing/routes";

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
const PlansPage = named(() => import("./plans/PlansPage"), "PlansPage");
const HelpPage = named(() => import("./help/HelpPage"), "HelpPage");
const AccountNotificationsPage = named(
  () => import("./notifications/AccountNotificationsPage"),
  "AccountNotificationsPage",
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
const GroupReportsPage = named(
  () => import("./groups/GroupReportsPage"),
  "GroupReportsPage",
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
export type SessionState =
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
  const groupMatch = location.pathname.match(/^\/app\/groups\/([^/]+)/);
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

/**
 * Redirects a pre-rename group sub-path (Spanish `settings`/`calendario`/
 * `resources`/`archivos`) to its English replacement, keeping the group id, any
 * deeper sub-path and the query string intact so old links land in the right
 * place instead of on the 404 page.
 */
function LegacyGroupPath({ to }: { to: string }) {
  const { groupId } = useParams();
  const { pathname, search, hash } = useLocation();
  const groupPrefix = routes.group(groupId ?? '');
  const rest = pathname.startsWith(`${groupPrefix}/`)
    ? pathname.slice(groupPrefix.length + 1)
    : "";
  const segments = rest.split("/").filter(Boolean);
  // Drop the legacy segment itself; keep anything after it.
  const kept = segments.slice(1).join("/");
  const target = [groupPrefix, to, kept].filter(Boolean).join("/");
  return <Navigate to={`${target}${search}${hash}`} replace />;
}

/** Redirects an old fixed route while preserving its search and hash. */
function LegacyRoutePath({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

/** Redirects old Group URLs into the canonical `/app/groups/:groupId` tree. */
function LegacyGroupEntry() {
  const { groupId } = useParams();
  const { pathname, search, hash } = useLocation();
  if (!groupId) return <Navigate to={routes.groups} replace />;
  const oldPrefix = `/groups/${groupId}`;
  const remainder = pathname.slice(oldPrefix.length);
  return <Navigate to={`${routes.group(groupId ?? '')}${remainder}${search}${hash}`} replace />;
}

/** Redirects old invitation URLs into the canonical product surface. */
function LegacyInvitationEntry() {
  const { token } = useParams();
  const { search, hash } = useLocation();
  if (!token) return <Navigate to={routes.join} replace />;
  return <Navigate to={`${routes.joinInvitation(token)}${search}${hash}`} replace />;
}

/** Redirects old slug routes while preserving nested paths and URL state. */
function LegacyGroupSlugEntry({ login = false }: { login?: boolean }) {
  const { slug } = useParams();
  const { pathname, search, hash } = useLocation();
  if (!slug) return <Navigate to={routes.groups} replace />;
  if (login) return <Navigate to={`${routes.brandedLogin(slug)}${search}${hash}`} replace />;
  const oldPrefix = `/g/${slug}`;
  const remainder = pathname.slice(oldPrefix.length);
  return <Navigate to={`${routes.groupSlug(slug)}${remainder}${search}${hash}`} replace />;
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
    return <Navigate to={`${routes.login}?next=${encodeURIComponent(next)}`} replace />;
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
  const location = useLocation();
  return (
    <AppShell user={ctx.user} onLogout={ctx.onLogout}>
      {/* A broken page must not take the shell down: contain it per route so
          the rail, top bar and navigation stay usable. */}
      <ErrorBoundary resetKey={location.pathname}>
        <Outlet context={ctx} />
      </ErrorBoundary>
    </AppShell>
  );
}

function GroupLayout() {
  const ctx = useAuth();
  const location = useLocation();
  return (
    <GroupWorkspace user={ctx.user} onLogout={ctx.onLogout}>
      <ErrorBoundary resetKey={location.pathname}>
        <Outlet context={ctx} />
      </ErrorBoundary>
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
    return `${window.location.origin}${routes.joinInvitation(invitation.token)}`;
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
export function AuthenticatedPlayer({ active }: { active: boolean }) {
  const { closeTrack } = useAudioPlayer();
  useEffect(() => {
    if (!active) closeTrack(); // stops audio on logout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]); // only on session change (closeTrack changes identity)
  return active ? <PersistentGlobalPlayer /> : null;
}


type AppRouterProps = {
  session: SessionState;
  user: CurrentUser | null;
  guestUser: CurrentUser | null | undefined;
  onLogout: () => void;
  onRetry: () => void;
  onUserChange: (user: CurrentUser) => void;
  onAuthSuccess: (user: CurrentUser | null) => void;
};

export function AppRouter({
  session,
  user,
  guestUser,
  onLogout,
  onRetry,
  onUserChange,
  onAuthSuccess,
}: AppRouterProps) {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Protected routes */}
        <Route
          element={
            <RequireAuth
              session={session}
              onLogout={onLogout}
              onRetry={onRetry}
              onUserChange={onUserChange}
            />
          }
        >
          <Route element={<AppLayout />}>
            <Route path={routes.app} element={<Navigate to={routes.home} replace />} />
            <Route path={routes.home} element={<HomePageR />} />
            <Route path={routes.groups} element={<GroupsPageWithActions />} />
            <Route path={routes.join} element={<JoinGroupPage />} />
            <Route path={routes.calendar} element={<CalendarPage />} />
            <Route path={routes.plans} element={<PlansPage />} />
            <Route path={routes.help} element={<HelpPage />} />
            <Route path={routes.account} element={<SettingsProfilePage />} />
            <Route
              path={routes.accountPreferences}
              element={<CuentaPreferencesPage />}
            />
            <Route path={routes.accountSecurity} element={<SecurityPage />} />
            <Route
              path={routes.accountMembership}
              element={<SettingsMembershipPage />}
            />
            <Route
              path={routes.accountNotifications}
              element={<AccountNotificationsPage />}
            />
            <Route
              path={routes.accountGroups}
              element={<Navigate to={routes.groups} replace />}
            />
          </Route>

          <Route path={routes.groupPattern} element={<GroupLayout />}>
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
            <Route path="calendar" element={<GroupCalendarPage />} />
            <Route path="tasks" element={<GroupTasksPage />} />
            <Route path="roles" element={<GroupRolesPage />} />
            <Route path="resources" element={<GroupResourcesPage />} />
            <Route path="reports" element={<GroupReportsPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="songs/:songId" element={<SongDetailPageR />} />
            <Route
              path="arrangements/:arrangementId"
              element={<ArrangementDetailPageR />}
            />
            <Route
              path="arrangements/:arrangementId/practice"
              element={<PracticePageR />}
            />
            <Route path="settings" element={<GroupSettingsPageR />} />
          </Route>

          {/* Path tenancy (ADR-0045 D1): /app/g/{slug} resolves and forwards to
              the Group workspace; the API verifies membership. */}
          <Route path={routes.groupSlugPattern} element={<GroupSlugResolver />} />
          <Route path={`${routes.groupSlugPattern}/*`} element={<GroupSlugResolver />} />
        </Route>

        {/* Public routes */}
        <Route path={routes.marketing} element={<MarketingPage user={user} />} />
        <Route path={routes.auth} element={<Navigate to={routes.login} replace />} />
        <Route
          path={routes.joinInvitationPattern}
          element={
            <PublicChrome user={user}>
              <JoinPage user={guestUser} />
            </PublicChrome>
          }
        />
        <Route
          path={routes.login}
          element={
            <GuestAuthRoute
              user={guestUser}
              mode="login"
              onSuccess={onAuthSuccess}
            />
          }
        />
        <Route
          path={routes.brandedLoginPattern}
          element={
            <BrandedLoginPage user={guestUser} onSuccess={onAuthSuccess} />
          }
        />
        <Route
          path={routes.register}
          element={
            <GuestAuthRoute
              user={guestUser}
              mode="register"
              onSuccess={onAuthSuccess}
            />
          }
        />
        <Route path={routes.confirm} element={<ConfirmPage />} />
        <Route path={routes.forgotPassword} element={<ForgotPasswordPage />} />
        <Route path={routes.resetPassword} element={<ResetPasswordPage />} />
        {/* Tenant-host session handoff (ADR-0067): redeems a single-use
            code for a host-only cookie on `{slug}.sonivo.lat`. */}
        <Route path={routes.handoff} element={<HandoffPage />} />

        {/* Legacy redirects: earlier English paths and the pre-rename
            Spanish paths. Both keep old links, bookmarks and shared
            invitations working instead of falling through to the 404.
            NOTE: the `path` must stay the OLD segment — rewriting it to
            the new path turns the entry into a self-redirect no-op. */}
        {legacyRouteRedirects.map(({ from, to }) => (
          <Route key={from} path={from} element={<LegacyRoutePath to={to} />} />
        ))}

        <Route path="/join/:token" element={<LegacyInvitationEntry />} />
        <Route path="/groups/:groupId/*" element={<LegacyGroupEntry />} />
        <Route path="/g/:slug/login" element={<LegacyGroupSlugEntry login />} />
        <Route path="/g/:slug/*" element={<LegacyGroupSlugEntry />} />

        {/* Group-scoped legacy paths, resolved relative to a group so the
            group id and any sub-path are preserved. */}
        {legacyGroupRouteRedirects.map(({ from, to }) => (
          <Route
            key={from}
            path={`${routes.groupPattern}/${from}/*`}
            element={<LegacyGroupPath to={to} />}
          />
        ))}

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
