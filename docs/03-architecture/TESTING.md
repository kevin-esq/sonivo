# TESTING.md — Sonivo

TDD / test strategy. Phase 3.0.2 establishes the engineering test gates (including Playwright E2E).

Engineering rule (AGENTS): RED → GREEN → REVIEW when implementation is approved.

---

## Pyramid

| Layer | Purpose | Tests | Does NOT test | When |
| ----- | ------- | ----- | ------------- | ---- |
| **Domain** | Invariants, entity behavior | Pure unit tests; no DB | HTTP, EF | First — with domain code |
| **Application** | Use-cases, AuthZ orchestration, transactions (fakes) | Unit/integration with in-memory fakes / Test doubles for ports | UI, full HTTP pipeline optional | With use-cases |
| **API** | Auth cookie, CSRF hooks, status codes, DTO validation | WebApplicationFactory + InMemory or test host | Full UI | After API host exists |
| **EF / Postgres** | Mappings, filters, constraints, soft-delete, migrations | Integration vs real PostgreSQL (`compose.yaml` locally; service container in CI) | Business rules already covered | Before relying on migrations |
| **Frontend** | Forms, routing guards, error display | Component/unit when needed; production build always | Backend | With UI features |
| **E2E Playwright** | Critical user journeys across browser → React → API → auth → PostgreSQL | Few happy / isolation paths | Exhaustive security matrix (keep in API tests) | Every important end-user workflow |

InMemory remains a **fast API test seam**. It does **not** replace PostgreSQL integration coverage.

---

## Playwright policy (binding)

- Playwright is **required** for critical browser journeys — not optional.
- Primary E2E suite uses the **real** stack (no fake backend, no parallel auth).
- Do **not** mock away the HTTP API for the critical-path suite.
- Security edge cases (403/404/409/CSRF) stay primarily in API/Application tests.
- Rule: **every important end-user workflow must have at least one browser-level E2E path.**

### Current critical journeys (Phase 3.0)

Located under `e2e/`:

1. Register → authenticated session  
2. Login / logout  
3. Create Group → open shell → list membership  
4. Non-member cannot open another Group by URL  

Rename / soft-delete remain covered at Application/API layers until UI exists.

### Local E2E

```powershell
docker compose up -d
dotnet ef database update --project src/Sonivo.Infrastructure --startup-project src/Sonivo.Api
dotnet run --project src/Sonivo.Api --launch-profile http
# other terminal:
cd web/sonivo-web; npm run dev
# other terminal:
cd e2e; npm ci; npx playwright install chromium; npm test
```

### CI

GitHub Actions (`.github/workflows/ci.yml`) starts PostgreSQL, applies migrations, runs API + Vite, then Playwright.

---

## Behavior focus

- Assert **observable outcomes** (state, returned DTOs, status codes, visible UI), not private methods.  
- Prefer fakes at Application ports over mocking EF internals.  
- One failing behavior per test name.  
- Never claim tests passed if they were not actually run.

---

## Priority for later vertical slices

### Phase 3.2 — Song / Arrangement / Link Resource (approved scope COMPLETED)

Authoritative matrix: [`PHASE-3.2-REPERTOIRE-SPEC.md`](PHASE-3.2-REPERTOIRE-SPEC.md) §11–§14. Nested Resource routes are the MVP contract. T-3.2.08 shipped sparse library E2E on `develop` (CI Playwright green).

| Layer | Focus |
| ----- | ----- |
| Domain | Song/Arr/Resource invariants (OriginKind, BPM, Label, Kind) |
| Application | AuthZ, Song cascade §8a, Resource ownership via Arr |
| API | 401/403/404/409/400 + CSRF; nested Resource get/patch/delete |
| Postgres | Composite FKs, filters, cascade tx, Kind nullability |
| Playwright (T-3.2.08 **COMPLETE**) | **TC-LIB-01** Owner Song→Arr→**link** Resource; **TC-LIB-02** Owner Song soft-delete; **TC-LIB-03** non-member denied library URL. **Deferred:** Member browser E2E; 409 conflict E2E; file Resource flows |

RSVP Playwright is Phase 3.5 (**TC-RSVP-01**), not this closed 3.2 slice.

### Phase 3.3 — Setlist / Event apply (thin S2 COMPLETED)

Authoritative matrix: [`PHASE-3.3-THIN-SPEC.md`](PHASE-3.3-THIN-SPEC.md). Shipped on `develop` (PR #6).

| Layer | Focus |
| ----- | ----- |
| Application | AuthZ; item replace; Apply label copy; confirmReplace / expectedVersion 409; empty Setlist Apply 400 |
| API | HTTP contracts + CSRF on mutating verbs |
| Playwright (T-3.3.05 **COMPLETE**) | **TC-EVT-01** Owner Setlist compose → Event create → Apply → plan labels visible. **TC-EVT-02** Setlist edit does not change Event plan until re-apply. **Deferred:** Member browser E2E (needs invite seed); 409 E2E matrix |

### Phase 3.4 — Thin invites (COMPLETED)

Authoritative matrix: [`PHASE-3.4-INVITE-SPEC.md`](PHASE-3.4-INVITE-SPEC.md). Shipped on `develop` (PR #8). **TC-INV-01 COMPLETE:** Owner invite → second user accept → Member sees Event plan, no mutate chrome.

### Phase 3.5 — Thin RSVP (authorized, not started)

Authoritative matrix: [`PHASE-3.5-RSVP-SPEC.md`](PHASE-3.5-RSVP-SPEC.md). **TC-RSVP-01** (coming): Owner Event with plan; invite Member; Member sets Yes; Owner sees that Member’s display name and Yes.
