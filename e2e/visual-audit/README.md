# Visual/UX audit harness

Purpose-built harness for the UI/UX audit (FASE 2). It is **not** a regression
gate: it lives outside `e2e/tests/` so CI never runs it.

## What it does

For each of the three viewports (`desktop` 1440x900, `tablet` 834x1112,
`mobile` 390x844, with touch) it walks every primary and secondary flow and,
per screen:

- captures a **full-page** and a **viewport** PNG,
- runs **axe-core** (WCAG 2.0/2.1/2.2 A+AA rule sets) and records violations by impact,
- records layout evidence: horizontal overflow + offending elements, interactive
  targets below 44x44, heading outline, gradient surfaces, stray overlay nodes.

Output: `.visual-audit/<viewport>/` — PNGs plus `evidence.json` (the machine-readable
input for the heuristic phase).

## Prerequisites

```powershell
docker compose up -d postgres
# API with the E2E confirmation hook (never enabled in prod)
$env:Auth__EnableTestHook='true'
dotnet run --project src/Sonivo.Api --launch-profile http
# built web on 5173 (the harness hits http://localhost:5173 by default)
cd web/sonivo-web; npm run build; npx vite preview --port 5173 --strictPort
```

Optional blob-path coverage (file Resources) requires the dev-bucket credentials
in the process environment (`R2__AccountId`, `R2__AccessKey`, `R2__Secret`,
`R2__BucketName=sonivo-blobs-dev`); without them the API falls back to the
filesystem store and the audit still runs.

## Run

```powershell
cd e2e
npx playwright test --config visual-audit/playwright.audit.config.ts                     # all three viewports
npx playwright test --config visual-audit/playwright.audit.config.ts --project=desktop   # one viewport
```

## Notes

- The harness creates its own account, group and content per run, so runs are independent.
- `SONIVO_E2E_BASE_URL` overrides the target host.
- Screenshots and evidence are gitignored (`.visual-audit/`).
