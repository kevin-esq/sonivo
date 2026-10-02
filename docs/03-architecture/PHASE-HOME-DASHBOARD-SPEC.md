# Phase — Inicio dashboard + app-shell sidebar

**Status:** **IN PROGRESS** · owner: Kevin Esquivel · started: 2026-10-02
**Scope owner:** ADR-0053 (ACCEPTED). Amends ADR-0043; supersedes `PHASE-APP-HEADER-SPEC.md` D4 for `/` and account routes.
**Branch:** `feature/home-dashboard` → `develop` (PR, CI green before merge).

---

## 1. Why

The signed-in landing route `/` was a flat "Mis grupos" list under a top header. The approved reference (ADR-0053) turns it into an **Inicio dashboard** inside a **persistent left sidebar**, matching the product's "your music, your people, your projects, one place" framing: quick actions, my groups, what's next across groups, and the account in the same rail.

---

## 2. Decisions (from ADR-0053)

| # | Decision |
| --- | --- |
| H1 | `/` = Inicio dashboard; `/grupos` = Mis grupos; `/unirse` = Unirse a grupo. |
| H2 | Left sidebar for authenticated non-group routes (`/`, `/grupos`, `/unirse`, `/cuenta/*`), responsive (rail ≥ `lg`, drawer below). Group workspace rail unchanged. |
| H3 | Top bar: global search field, notification bell (disabled placeholder), user avatar + menu. |
| H4 | `Plan y facturación`, `Uso y límites`, `Notificaciones` and the bell = **disabled placeholders**. No billing, no notification backend (ADR-0042 / FUTURE). |
| H5 | Backend `GET /api/activity/upcoming` (auth, group-scoped) powers "Tu próxima actividad". |
| H6 | Covers stay emoji/gradient; logo-ready card. Real cover upload FUTURE. |
| H7 | Search filters loaded groups + navigation only. |
| H8 | i18n es/en, a11y floor, light/dark parity. No new dependencies. |

---

## 3. Architecture

```
web/sonivo-web/src/
├─ shell/
│  ├─ AppShell.tsx            NEW  sidebar + topbar layout + mobile drawer
│  ├─ AppSidebar.tsx          NEW  nav sections, placeholders, user card
│  ├─ AppTopBar.tsx           NEW  search field, bell (disabled), user menu
│  ├─ GlobalSearch.tsx        NEW  filters loaded groups + nav actions
│  ├─ navSections.ts          NEW  sidebar nav model
│  └─ GroupsChrome.tsx        REF  uses AppShell for /grupos and /unirse
├─ home/
│  ├─ HomePage.tsx            NEW  greeting, quick actions, groups, activity, banner
│  ├─ QuickActions.tsx        NEW  4 action cards
│  ├─ GroupsGrid.tsx          NEW  group cards (cover/role/members/next event)
│  ├─ ActivityRail.tsx        NEW  next events across groups
│  ├─ LearningBanner.tsx      NEW  "¿Te gustaría aprender algo nuevo?"
│  └─ useUpcomingActivity.ts  NEW  hook over GET /api/activity/upcoming
├─ tenancy/
│  └─ JoinGroupPage.tsx       NEW  page for /unirse (reuses JoinForm logic)
└─ App.tsx                    REF  routes + layouts
```

### Routes

```
/                     Inicio (AppShell)
/grupos               Mis grupos (AppShell)
/unirse               Unirse a grupo (AppShell)
/cuenta               Perfil (AppShell)
/cuenta/notificaciones  placeholder (AppShell)
/cuenta/preferencias  Preferencias (AppShell)
/cuenta/seguridad     SecurityPage (AppShell)
/cuenta/grupos        -> redirect /grupos
/plan                 placeholder (AppShell)
/ayuda                placeholder (AppShell)
/groups/:groupId/*    GroupWorkspace (unchanged)
```

Legacy redirects `/settings*`, `/security` stay valid.

---

## 4. Backend

| Change | File | Detail |
| --- | --- | --- |
| `GET /api/activity/upcoming` | `src/Sonivo.Api/Program.cs` | Auth required; resolves user id; returns upcoming events across the caller's groups. |
| Handler | `src/Sonivo.Application/Tenancy/ListUpcomingActivityHandler.cs` (NEW) | Validates user id; delegates to store. |
| Store query | `src/Sonivo.Infrastructure/Persistence/EfEventStore.cs` (+ `IEventStore`) | Join memberships → events; `!IsHidden`, not cancelled, `StartsAt >= now`; order by `StartsAt`; cap (e.g. 10). |
| DTO | `IEventStore.cs` `UpcomingActivityItem` | `GroupId`, `GroupName`, `EventId`, `Title`, `Type`, `StartsAt`. |
| API test | `tests/Sonivo.Api.Tests` | Unauthenticated → 401; only groups the caller belongs to; ordering; hidden/cancelled excluded. |

No schema changes, no migrations, **no new dependencies**.

---

## 5. Tickets

- **T-HOME-01** Docs: ADR-0053 + this spec + CONTEXT/DESIGN/INDEX/NOW.
- **T-HOME-02** Tokens + `AppShell`/`AppSidebar`/`AppTopBar` + mobile drawer.
- **T-HOME-03** Routes and legacy redirects; update in-app links that assumed `/` = groups.
- **T-HOME-04** Home dashboard components + `useUpcomingActivity`.
- **T-HOME-05** Backend `GET /api/activity/upcoming` + API tests.
- **T-HOME-06** i18n es/en + a11y + light/dark pass.
- **T-HOME-07** E2E: new `home-dashboard.spec.ts`; adapt specs that treat `/` as the group list; Playwright MCP visual pass.
- **T-HOME-08** Docs sync + Git (atomic commits → push → PR to `develop` via `gh`).

## 6. Per-wave gate

1. `npm run build` (green) · `oxlint` (0 errors).
2. `dotnet test Sonivo.slnx` when backend touched.
3. Targeted E2E for the wave, then the **full** Playwright suite locally (`vite preview`, see `NOW.md`).
4. Conventional commit (author Kevin Esquivel only, no AI trailers) → push → PR → **CI green**.

## 7. Out of scope

Billing/payments and usage limits (placeholders only) · in-app notification center and bell backend · real image cover upload · backend i18n · auth/session changes · new dependencies.
