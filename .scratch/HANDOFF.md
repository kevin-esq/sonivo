# HANDOFF — white-label / managed accounts / roles / notifications

**Updated:** 2026-10-02 (F3b, F4 and F5 delivered by the agent)
**Not committed on purpose** (`.scratch/` must never enter a commit).

## Merged (all on `develop`)

| Phase | PR | Merge commit |
| --- | --- | --- |
| F0 docs + 4.2 `.lrc` | #166 / #167 | `92079b0` / `fc0ad42` |
| F1 4.5 Stage mode | #168 | `bd53c353` |
| F2a 4.3 slug foundation | #169 | `655c3325` |
| 4.9/4.10 design note | #170 | `19e1b85d` |
| F2b 4.3 slug change-once | #171 | `324de5e5` |
| F2b 4.3 branding + entorno | #172 | `42acfb2e` |

`develop` = `42acfb2`. CI green after every merge.

## Open PRs (agent-completed, awaiting merge)

| Phase | PR | Branch | Merge rule |
| --- | --- | --- | --- |
| **F3 4.1** managed accounts (parts 1+2/F3b) | [#173](https://github.com/kevin-esq/sonivo/pull/173) | `feature/managed-accounts` | **Human merges** (agent must not) |
| **F4 4.4** roles + audit | [#174](https://github.com/kevin-esq/sonivo/pull/174) | `feature/group-roles` | **Human merges** (agent must not) |
| **F5 4.8** notifications + ICS | [#175](https://github.com/kevin-esq/sonivo/pull/175) | `feature/notifications` | **Normal merge** (agent merges when CI green) |

All three PRs are CI **green** and have the independent security review posted as a comment
(F5 normal-merge; F3/F4 review-only).

### F3b (in #173) — DONE
Handle login (`handle@slug`, uniform 401, per-`(slug,IP)` rate limit, lockout), CSV bulk with per-row
errors, GDPR export (group + own data), Owner-transfer notice (audit + email), Google pre-hijacking
hardening (no auto-link to unverified email; revoke passkeys + rotate stamp), passkey registration
clears `ManagedByGroupId`, E2E blocking modal, H2 closed. Migration `AddMembershipHandle`.
Tests 575/0; E2E flags ON 65+2 / OFF 63+4.

### F4 (in #174) — DONE
`Owner|Manager|Member|Viewer` + musical role; `RequireManagerAsync`/`RequireParticipantAsync`;
conductor Manager-capable; `GroupAuditLog` (ids + metadata, Owner-only); PeoplePage role selector +
musical-role field. ADR-0051 added to DECISIONS.md. Migration `AddGroupRolesAndAudit` (widen).
Tests 559/0; E2E 64+2.

### F5 (in #175) — DONE, normal merge
Event created/updated/cancelled + RSVP confirmation via Gmail sender; per-group ICS feed
(`GET /api/groups/{gid}/calendar.ics`); all behind `Features:Notifications` (default off); ADR-0052
(reopens the PHASE-3.9 firewall). No migration. Tests 548/0; E2E flags ON 65+2.

## Remaining

- **F6** final report (this session).
- **4.6 / 4.7** blocked on an owned domain (D2). 4.9/4.10 optional.

## Known residuals / assumptions

- Group **soft-delete** does not schedule hard deletion of managed accounts (no scheduler).
- Handles are unique per group at the app + filtered unique index; a race surfaces as a conflict.
- CSV partial failure can orphan an account if the membership save fails after account creation.
- Notifications are best-effort; a member without email gets in-app + ICS only.
- ADR-0045…0052 live as PROPOSED in `PHASE-WHITELABEL-SPEC.md`; only ADR-0051 (F4) and ADR-0052 (F5)
  were copied into `DECISIONS.md` as ACCEPTED here. **Docs gap:** ADR-0046/0047/0048 are implemented
  but not yet in the ledger — recommend a follow-up docs PR.

## Local E2E runner (important)

`vite dev`/`preview` die under load here. Use the hardened static+proxy server:

```powershell
$env:Auth__EnableTestHook='true'; $env:Features__StageMode='true'; $env:Features__GroupBranding='true'; $env:Features__Lrc='true'; $env:Features__Notifications='true'; $env:Features__ManagedAccounts='true'
$env:Logging__LogLevel__Default='Warning'; $env:Logging__LogLevel__Microsoft='Warning'
dotnet run --project src/Sonivo.Api --launch-profile http          # :5171
cd web\sonivo-web; npm run build; cd ..\..
node .scratch/tmp/spa-proxy.mjs                                    # :5173 (hardened: stream/server error handlers)
cd e2e; npm test
```

## Verification / deploy facts

- Local DB: `sonivo-postgres`, `localhost:5433`, `sonivo_dev`. **Never** run migrations against
  production; **do not** connect to Neon.
- `render.yaml`: `SONIVO_MIGRATE_ON_START=true`; Render deploys `develop`; migrations are additive and
  flag-gated.
- Before every commit: `git diff --cached --name-only` — never `.scratch/`, `.env`, profiles.
