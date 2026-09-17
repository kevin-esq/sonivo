# Sonivo

SaaS organizational layer for musical groups and projects.

## Phase status

Phases **0–3.0.1** complete. **Phase 3.0.2** establishes Git workflow, CI, and Playwright E2E gates.  
Further product features require a separate explicit authorization.

## Solution layout

```text
Sonivo.slnx
compose.yaml           # local PostgreSQL only
e2e/                   # Playwright critical journeys
.github/workflows/     # CI
src/ …
tests/ …
web/sonivo-web/
docs/
```

## Prerequisites

- Docker and Docker Compose
- .NET 9 SDK
- Node.js 20+
- Playwright browsers (`npx playwright install chromium` in `e2e/`)

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
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat(groups): …`, `fix(auth): …`, `test(e2e): …`, `chore(ci): …`).
- PRs use `.github/pull_request_template.md` and must pass CI (build, tests, Playwright).
- **Agent Git authority / checkpoints:** ticket completion ≠ commit/push. After human approval, a Git checkpoint is required before treating work as durably closed. Full policy: [`AGENTS.md`](AGENTS.md) (Git section). Session state: [`.scratch/NOW.md`](.scratch/NOW.md).

## Local PostgreSQL (Docker)

Development connection (`src/Sonivo.Api/appsettings.Development.json`):

`Host=localhost;Port=5433;Database=sonivo_dev;Username=sonivo;Password=sonivo`

Credentials are development-only.

```powershell
docker compose up -d
docker compose exec postgres pg_isready -U sonivo -d sonivo_dev
dotnet ef database update --project src/Sonivo.Infrastructure --startup-project src/Sonivo.Api
docker compose down          # keeps volume
docker compose down -v       # DESTRUCTIVE reset
```

## Backend

```powershell
dotnet build Sonivo.slnx
dotnet test Sonivo.slnx
dotnet run --project src/Sonivo.Api --launch-profile http
```

API: `http://localhost:5171`

## Frontend

```powershell
cd web/sonivo-web
npm install
npm run dev
```

Vite: `http://localhost:5173` (proxies `/api` → API).

## Playwright E2E

With Postgres, API, and Vite already running:

```powershell
cd e2e
npm ci
npx playwright install chromium
npm test
```

See [`docs/03-architecture/TESTING.md`](docs/03-architecture/TESTING.md).

## Docs

Start at [`docs/00-context/CONTEXT.md`](docs/00-context/CONTEXT.md) and [`AGENTS.md`](AGENTS.md).
