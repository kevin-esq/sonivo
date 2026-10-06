# NOW - agent focus

**Updated:** 2026-10-05

## Checkpoint state

```text
Implementation: COMPLETE - prod topology defined + tenancy/handoff hardened
  Branch: develop (integration); work on 3 PRs from develop
  Delivered this session (PRs open):
    - #226 feat(tenancy): reserved-slug list extended to the full host map
      (apex, www, app, account, api, staging, dashboard, panel, signup, billing,
      status, cdn, docs, blog, smtp, dev, test, internal, system, ...) + domain
      tests. Server list is authoritative.
    - #227 test(session): endpoint-level handoff verification (401/404, host-only
      cookie, single-use, UA binding) + web `/session/handoff` redemption route +
      client host bridge `{slug}.sonivo.lat -> /g/{slug}` (ADR-0067).
    - #228 docs(deploy): ADR-0069 + docs/03-architecture/DEPLOYMENT.md (host map,
      reserved slugs, handoff flow, DNS/TLS, Hetzner VPS runbook, Vercel BFF,
      Neon/R2 per env, smoke tests) + deploy/docker-compose.yml + Caddyfile +
      env.production.example. Provisioning is owner-gated (contract Hetzner).
  Validation run locally:
    - dotnet test Sonivo.slnx (Release): Domain 170, Application 211,
      Integration 58, API 232/241 (branch) - all green.
    - web: npm run build --workspace @sonivo/app (BFF) + NEXT_EXPORT=1 export:
      both green.
  Infra configured (unchanged this session): staging on Render free +
    staging.sonivo.lat, Neon staging branch, provider-agnostic email (Delivered).
Human approval: APPROVED (owner authorized full execution)
Git checkpoint: COMMITTED + PUSHED; PRs #226, #227, #228 open (not yet merged)
Remote: PUSHED
CI: PR checks running; develop CI intermittently fails with a GitHub runner
    infrastructure error ("job was not acquired by Runner of type hosted"),
    not a code failure -> re-run when runners are available.
```

## Prod topology (decided - ADR-0069)

- Frontend/BFF -> **Vercel** (Next server build, `API_ORIGIN=https://api.sonivo.lat`).
- Backend -> **Hetzner Cloud VPS** (existing Docker image + Caddy TLS on `api.sonivo.lat`).
- DB -> **Neon** prod branch; storage -> **Cloudflare R2** `sonivo-prod`; email -> provider-agnostic (ADR-0068).
- Host map: apex/www/app/account + `*.sonivo.lat` on Vercel; `api` on Hetzner; `staging` stays on Render.
- Session: apex auth + single-use handoff code + **host-only** cookie; parent-domain cookie PROHIBITED.
- Owner action remaining: contract Hetzner, create the Vercel project, set DNS, then
  `docker compose --env-file .env up -d --build` (see DEPLOYMENT.md §6).

## Follow-ups
- Wire the group list "open" action to `POST /api/session/handoff/start` when the
  target is a tenant host (today `/g/{slug}` path tenancy still works).
- SignalR through the Vercel BFF: hub origin guard compares Origin to the API
  request host; needs a same-host origin from the BFF (no wildcard allow-list).
- Next middleware / `[tenant]/[locale]` decomposition (ADR-0067 T-NEXT-06, FUTURE).
- develop CI keeps hitting the GitHub hosted-runner shortage; re-run when green.
- R2 staging vs prod bucket split when prod exists.
- Google sign-in: add prod redirect URIs (`https://sonivo.lat`, `https://app.sonivo.lat`).
- Unrelated untracked files remain: .vscode/, .turbo/, .scratch/shots/, .scratch/security-sweep-26df6f5/.
