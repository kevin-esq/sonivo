# Sonivo

**Your music. Your people. Your projects. One organized place.**

Sonivo is a SaaS organizational layer for musical groups and musical projects:
shared repertoire, people, rehearsals, and performances in one place — without
replacing a DAW or a distributor.

- **Core job:** keep a group's shared repertoire, people, and upcoming
  performances organized so everyone works from the same current materials.
- **Recurring loop:** prepare the next musical event — build a setlist, apply it
  to an event, members open the current materials and RSVP.
- **Personas:** Organizer (Owner) and Member (ADR-0006/0012). Guest is not
  required in the MVP.

## Status

Phases **0–3.9 are CLOSED/COMPLETED** and Gate B is closed. Product truth lives in
[`docs/00-context/CONTEXT.md`](docs/00-context/CONTEXT.md); accepted decisions and
their scope firewalls live in
[`docs/03-architecture/DECISIONS.md`](docs/03-architecture/DECISIONS.md).

The backend is on **.NET 10 / C# 14** (native upgrade, PR
[#214](https://github.com/kevin-esq/sonivo/pull/214)): `net10.0` across `src/` and
`tests/`, EF Core 10 + Npgsql 10, and the CI/Docker toolchain on the .NET 10
SDK/runtime.

> Product changes require explicit authorization. See [`AGENTS.md`](AGENTS.md)
> and the current checkpoint in [`.scratch/NOW.md`](.scratch/NOW.md).

## Stack

| Layer | Technology |
| --- | --- |
| Backend | .NET 10 / ASP.NET Core Web API (minimal APIs), C# 14, EF Core 10, ASP.NET Core Identity, PostgreSQL (Npgsql), SignalR |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4; Node.js 20; `oxlint` |
| Tests | xUnit (domain / application / API / integration), Playwright critical journeys, PostgreSQL-backed CI |
| Storage | PostgreSQL by default; Cloudflare R2 optional blob backend (ADR-0035) |

Architecture is a **modular monolith** (ADR-0009–0011): no microservices, CQRS, or
event sourcing.

## Solution layout

```text
Sonivo.slnx
compose.yaml                 # local PostgreSQL only (host port 5433)
Directory.Build.props        # NuGet audit / DevSecOps gates
src/
  Sonivo.Api/                # ASP.NET Core Web API (endpoints, auth, SignalR hubs)
  Sonivo.Application/        # use cases (commands / queries)
  Sonivo.Domain/             # aggregates (Group, Song, Arrangement, …)
  Sonivo.Infrastructure/     # EF Core, Identity, blobs, external services
tests/
  Sonivo.Domain.Tests/
  Sonivo.Application.Tests/
  Sonivo.Api.Tests/
  Sonivo.Integration.Tests/  # EF model + PostgreSQL-backed
web/apps/app/              # React 19 + Vite + Tailwind SPA
e2e/                         # Playwright critical journeys
docs/                        # product, domain, architecture, tooling
.github/workflows/           # ci.yml, codeql.yml, security.yml
```

## Domain in one screen

- **Group** is the tenant; a User can belong to many Groups. Roles are
  **Owner** | **Member** (ADR-0005/0012).
- **Song** is identity; **Arrangement** is the playable aggregate;
  **Arrangement Resource** holds charts / audio / click / lyrics
  (ADR-0007/0008/0014/0024/0025).
- **Setlist** is a reusable plan template; applying it copies items onto an
  **Event** (ADR-0016/0017).
- **Event** (`rehearsal` | `performance` | `other`) with cancel/soft-hide and a
  per-member **RSVP** (`yes`/`no`/`maybe`). A thin conductor room uses
  self-hosted SignalR (ADR-0036).
- **Branding:** per-group white-label (colors, logo, banner, typography) with an
  AA-safe `--brand-*` token contract (ADR-0048/0054/0060).

## Prerequisites

- **.NET 10 SDK**
- **Node.js 20+**
- **Docker + Docker Compose**
- Playwright browsers (`npx playwright install chromium` in `e2e/`)

## Getting started

### 1. Local PostgreSQL

```powershell
docker compose up -d
docker compose exec postgres pg_isready -U sonivo -d sonivo_dev
```

Development connection (`src/Sonivo.Api/appsettings.Development.json`):

`Host=localhost;Port=5433;Database=sonivo_dev;Username=sonivo;Password=sonivo`
(development-only credentials).

### 2. Backend

```powershell
dotnet restore Sonivo.slnx
dotnet build Sonivo.slnx
dotnet test Sonivo.slnx          # requires PostgreSQL for the integration project
dotnet ef database update --project src/Sonivo.Infrastructure --startup-project src/Sonivo.Api
dotnet run --project src/Sonivo.Api --launch-profile http
```

API: `http://localhost:5171`

### 3. Frontend

```powershell
cd web/apps/app
npm install
npm run dev
```

Vite: `http://localhost:5173` (proxies `/api` and `/hubs` to the API).

## Playwright E2E

With PostgreSQL, the API, and the Vite dev server running:

```powershell
cd e2e
npm ci
npx playwright install chromium
npm test
```

The API must run with the E2E-only mailbox bypass enabled (`POST
/api/auth/test/confirm` 404s otherwise — **never** set this in production):

```powershell
$env:Auth__EnableTestHook = "true"
dotnet run --project src/Sonivo.Api --launch-profile http
```

See [`docs/03-architecture/TESTING.md`](docs/03-architecture/TESTING.md).

## Security & tenancy invariants

- Group-scoped authorization is **server-enforced**; a client-supplied Group ID
  is **never** authorization.
- Web auth uses ASP.NET Core **Identity cookies + antiforgery** — no web
  JWT/BFF.
- File access is authorized; CSRF per ADR-0020.
- Google sign-in is configured via `Authentication:Google:*` and is
  **never** reused for `Gmail:*` sending.

## CI

- `ci.yml` — backend build & tests (PostgreSQL service), frontend build,
  Playwright E2E.
- `codeql.yml` — CodeQL static analysis.
- `security.yml` — SCA gate (`dotnet list package --vulnerable`; NuGet audit
  `all` mode, High/Critical advisories fail the build).

PRs use [`.github/pull_request_template.md`](.github/pull_request_template.md)
and must be green before merge.

## Git workflow

Branches:

```text
main          # stable / releasable
develop       # integration
feature/*     # product work from develop → PR → develop
fix/*         # fixes
chore/*       # tooling / CI
docs/*        # documentation
```

- Do not land feature work directly on `main`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
  (e.g. `feat(groups): …`, `fix(auth): …`, `test(e2e): …`, `chore(ci): …`).
- **Agent Git authority / checkpoints:** ticket completion ≠ commit/push. After
  human approval, a Git checkpoint is required before work is durably closed.
  Full policy: [`AGENTS.md`](AGENTS.md) (Git section). Session state:
  [`.scratch/NOW.md`](.scratch/NOW.md).

## Docs

Start Obsidian navigation at [`docs/00-context/INDEX.md`](docs/00-context/INDEX.md).
Project context is in [`docs/00-context/CONTEXT.md`](docs/00-context/CONTEXT.md),
accepted decisions in
[`docs/03-architecture/DECISIONS.md`](docs/03-architecture/DECISIONS.md), and
agent instructions are consolidated in [`AGENTS.md`](AGENTS.md).
