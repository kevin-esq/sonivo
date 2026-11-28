# DEPLOYMENT.md — Sonivo production topology, host map and runbooks

**Status:** the provider map below records the accepted ADR-0069 target. Current
operations are recorded separately below. The owner describes Render as the
current live deployment from `develop`, not the final production release; after
the product is ready, the release flow will move to `main` with production
configuration. The owner reconfirmed on 2026-11-27 that Hetzner remains the
future API host. This aligns with accepted ADR-0069; no superseding host decision
is needed. Render remains the current live `develop` deployment until the
product-readiness gate and approved `main` production cutover.

Canonical decisions: **ADR-0067** (Next.js BFF, host-based tenancy, handoff
session) and **ADR-0069** (production topology). Related: ADR-0035 (R2),
ADR-0049 (hosts/subdomains), ADR-0068 (email transport), ADR-0020 (CSRF).

## Current operations — 2026-11-27

**FACT:** Render's current live `sonivo` API service tracks `develop`,
auto-deploys commits, uses the repository `Dockerfile`, and checks
`/api/health`. The service sets `ASPNETCORE_ENVIRONMENT=Production`, while the
owner identifies the connected Neon branch as `staging` and says the final
production release is still pending. After the product is ready, the owner
plans to move the release flow to `main` and configure production. The ASP.NET
environment name does not by itself establish that the final production launch
has happened. PR #376 (`4f37747`) initially failed
during Docker build because the embedded RLS verifier SQL was missing from the
image build context. PR #377 (`f3d2183`) fixed the copy; Render reports that
deployment live, and `/api/health/ready` returned HTTP 200 on 2026-11-22. The
Production startup guard therefore passed against Render's configured database
connection. The owner reports `SONIVO_MIGRATE_ON_START=false`; `render.yaml`
matches. Render's service metadata does not expose the database connection
string, which remains unread and unrecorded. The owner confirms the API uses
Neon branch `staging` as its current production database.

**FACT:** `20261120200916_AllowCurrentSlugPublicBranding` from PR #374 is
applied on the active database. It adds the current-slug selector to the public
GroupBranding read policy. A Neon connection using `sonivo_app` passed the
runtime-role verifier. After a public readiness request, `pg_stat_activity`
showed a `sonivo_app` session behind PgBouncer; the connection string was not
read.

**FACT:** On 2026-11-21, the migration's exact `Up` SQL and matching
`__EFMigrationsHistory` row were applied in one privileged Neon transaction.
`dotnet ef` was not run because no local migration connection was configured.
The `Up`/`Down` SQL and runtime verifier passed on a temporary Neon copy of the
active database before the production transaction. That copy and its compute
endpoint were deleted after the rehearsal. Future schema changes must use the
separate privileged migration procedure below, not API startup.

**FACT (verified in staging):** PR #376 adds a Production startup check that
runs the read-only runtime-principal and RLS-policy verifier before the API
begins listening. Startup fails closed if the connection is not the constrained
`sonivo_app` principal, a reviewed RLS table lacks forced RLS/policy coverage,
or another verifier check fails. This check does not apply migrations and does
not replace the privileged migration procedure. PR #377 fixed the Docker build
context; the resulting Render deployment is live and readiness returned 200.

**FACT:** Owner direction, reaffirmed 2026-11-27: keep the current Render
deployment on `develop` while the main product is being completed. After the
product is ready, move the final production release flow to `main` with the
required production configuration. This records direction; it does not change
Render settings.

**FACT:** No production migration job gates or sequences Render's auto-deploy.
For the current `develop` release flow, the documented control is manual:
apply and verify the compatible schema migration with the privileged role
before merging API code that depends on it; keep destructive contract changes
in a later release. Render and CI do not enforce this order.

**OPEN (future release automation):** Before moving production release flow to
`main`, decide whether to automate the privileged migration gate and add it to
the release pipeline. Until then, release owners must follow the manual steps
below and record migration IDs and verifier results. This is an operational
control, not a production migration job. Complete the `main` production
configuration when the product is ready for publication.

**FACT:** The owner confirmed on 2026-11-27 that Hetzner remains the future API
host, consistent with accepted ADR-0069. The repository already has a
multi-stage .NET 10 and static-export image in
[the root Dockerfile](../../Dockerfile). `render.yaml` defines a separate Node
Next.js service and Docker API service. The development `compose.yaml` starts
PostgreSQL only; `deploy/docker-compose.yml` runs API plus Caddy and still names
Hetzner in its topology comments. These files represent different deployment
paths; none was changed by this status note.

**FACT (provider pages consulted 2026-11-27):** SmarterASP advertises ASP.NET
Core 10 on its Windows hosting plans, starting at `$2.95/month`. Its Linux VPS
page advertises Docker and root access; the lowest listed Linux VPS is
`$49.95/month` (8 GB RAM, 4 CPU cores). The published pages do not identify the
owner's purchased plan or confirm plan-specific WebSocket, process-recycle,
health-probe, port, storage, or network guarantees. Sources:
[ASP.NET Core 10 hosting](https://www.smarterasp.net/asp.net_core_hosting/),
[Linux VPS plans](https://www.smarterasp.net/vps_linux/),
[WebSocket support article](https://www.smarterasp.net/support/kb/a1928/how-to-host-web-socket-protocol-application-in-asp_net.aspx).

**PROPOSAL:** Keep Render as the current `develop` deployment until the
product-readiness gate and approved `main` production cutover. Use the accepted
Hetzner Cloud VPS + Caddy target for the future API and keep the Next.js BFF on
Vercel. Before cutover, verify the selected Hetzner plan, .NET 10 startup,
WebSockets/SignalR, health probes, process restarts, secret delivery,
persistent Caddy data, Neon/R2 networking, migration ordering, and rollback in
an isolated environment. Do not change provider settings in this ticket.

**OPEN QUESTION:** What Hetzner server size and monthly infrastructure budget
should T-502 validate before production cutover? This does not block keeping
ADR-0069 as the selected host target; no server is provisioned by this document.

ADR-0069 remains the accepted target topology until a superseding decision
amends it. This current-operations note does not change that ADR.

---

## 1. Provider map

| Concern | Provider | Notes |
| --- | --- | --- |
| Frontend / BFF | **Vercel** (Next.js server, not static export) | Always warm; server-side rewrites proxy `/api` and `/hubs` |
| Backend API | **Hetzner Cloud VPS** (Docker + Caddy) | `api.sonivo.lat`; the browser never calls it directly |
| Database | **Neon** (Postgres, branches) | Prod branch isolated from `staging` |
| Object storage | **Cloudflare R2** | `sonivo-prod` bucket, separate from staging |
| Email | Provider-agnostic `IEmailSender` (ADR-0068) | `Email:Transport=api|smtp`, config only |
| Staging | **Render free** + Neon `staging` branch | API service remains on `sonivo.onrender.com`; request-aware Next service is `sonivo-web` |

**PROHIBITION:** no GCP / Cloud Run; no paid tier is enabled. The prod backend is
the owner-contracted Hetzner VPS.

---

## 2. Host map

| Host | Role | Served by |
| --- | --- | --- |
| `sonivo.lat` | Public marketing / landing | Vercel (separate deployment target under ADR-0089) |
| `www.sonivo.lat` | 308 redirect to apex | Vercel |
| `auth.sonivo.lat` | Identity entry: sign-in, registration, recovery, MFA, passkeys | Separate Next deployment (ADR-0089; not provisioned yet) |
| `app.sonivo.lat` | Authenticated product entry | Separate Next deployment / BFF (ADR-0089; not provisioned yet) |
| `account.sonivo.lat` | Compatibility alias to `auth.sonivo.lat` after cutover | Redirect only; do not serve a separate identity app |
| `<slug>.sonivo.lat` | **Per-group workspace** (host-based tenancy) | Vercel (BFF) |
| `api.sonivo.lat` | .NET API + SignalR `/hubs` (BFF-to-API only) | Hetzner (Caddy) |
| `staging.sonivo.lat` | Staging | Render |
| `www` | Redirect to apex | Vercel |

The tenant slug in `<slug>.sonivo.lat` is a **selector, never authorization**.
Membership is verified server-side for the authenticated principal on every
tenant-scoped request (see ADR-0067 §3 and `GroupAccessService`).

**Migration state (ADR-0089):** the table above is the target host map, not proof
that the separate deployments or DNS records exist. The repo currently has one
Next bridge and apex-host auth. Keep apex auth and existing redirects active
until WBR-02–06 are deployed and the cross-host auth, OAuth, passkey, cookie,
CSRF, CSP/CORS, indexing, and staging gates pass. The root `sonivo.lat` must
remain the public canonical host; private app/auth/tenant responses must emit
`noindex, nofollow`. See [web surface migration](PHASE-WEB-BOUNDARIES-SPEC.md).

---

## 3. Reserved slugs

Reserved segments can never become a group slug (or tenant host). The
authoritative list is `src/Sonivo.Domain/Tenancy/GroupSlug.cs`; the client
mirrors it for UX only (`web/apps/app/src/tenancy/tenantHost.ts`, validation
symmetry). The server rejects reserved, invalid and already-taken slugs on
create/rename.

```text
account admin api app assets auth billing blog cdn cuenta dashboard dev docs
error favicon g group groups health help internal join login logout mail
manifest panel privacy register robots settings signup sitemap smtp staging
static status support system terms test www
```

Rules (`GroupSlug`): 3–40 chars, lowercase ASCII letters/digits and single
hyphens, no leading/trailing/double hyphen, never reserved, never reused after a
rename (historical slugs resolve with a permanent redirect).

---

## 4. Cross-subdomain session (ADR-0067)

**PROHIBITION:** never set a parent-domain cookie (`Domain=.sonivo.lat`). The
session cookie is **host-only** (`Domain` omitted); outside Development it uses
the `__Host-sonivo.session` prefix (requires `Secure`, `Path=/`, no `Domain`).

Flow:

1. **Current bridge:** the user authenticates at the apex; the session cookie is
   host-only on that host. **Target (ADR-0089):** authenticate at
   `auth.sonivo.lat`; keep its cookie host-only there.
2. Opening a group calls `POST /api/session/handoff/start { slug }` (authenticated
   + membership-checked). The API returns a redirect to
   `https://{slug}.sonivo.lat/auth/session/handoff?code=…`.
3. The tenant host's `/auth/session/handoff` page redeems the code with
   `POST /api/session/handoff/redeem { code }`, which sets a **host-only** cookie
   on that host, then reloads.
4. The host bridge forwards `{slug}.sonivo.lat/…` to the canonical
   `/app/g/{slug}`
   resolver, which re-verifies membership server-side.

**App scope (`app.sonivo.lat`).** `start` with **no slug** (or a blank one) issues
a user-scoped handoff for the product host: any authenticated user may start it,
and redeem skips the membership check because there is no group to authorize
(the code is still single-use, 256-bit, 90 s, UA-bound). This lets the current
apex and the future identity host, after exact-origin configuration, hand a
session to `app.sonivo.lat`. The redirect is enabled by setting
`NEXT_PUBLIC_APP_HOST=app.sonivo.lat` on the frontend; when unset, the apex keeps
serving the product directly.

Handoff code guarantees: ≥256-bit CSPRNG, opaque, stored only as SHA-256 hash,
**single-use (atomic `TryRemove`)**, TTL 90 s (≤120 s ceiling), advisory
User-Agent binding, per-IP rate limit (`session-handoff`, 20/min).

**FACT (verified by tests):** `tests/Sonivo.Api.Tests/SessionHandoff/` covers the
ticket lifecycle and the endpoint contract (401/404, host-only cookie, single-use,
UA mismatch).

---

## 5. DNS and TLS

Namecheap (BasicDNS) for `sonivo.lat`:

| Record | Type | Value |
| --- | --- | --- |
| `@` (apex) | A / ALIAS | Vercel (per Vercel's domain instructions) |
| `www` | CNAME | Vercel |
| `app` | CNAME | Vercel |
| `auth` | CNAME | Vercel (separate identity project after WBR-04) |
| `account` | CNAME | Vercel |
| `*` (wildcard) | CNAME | Vercel |
| `api` | A | Hetzner VPS public IPv4 |
| `staging` | CNAME | `sonivo.onrender.com` (unchanged) |
| Resend DKIM / SPF / DMARC | TXT / CNAME | **keep intact** |

- TLS at Vercel: custom + wildcard domains (`*.sonivo.lat`).
- TLS at Hetzner: Caddy obtains `api.sonivo.lat` certificates automatically
  (`deploy/Caddyfile`).
- Keep the Resend DKIM/SPF/DMARC records exactly as-is when editing DNS.

---

## 6. Phase A — Hetzner VPS runbook

**ASSUMPTION:** Ubuntu 24.04 LTS, 2 vCPU / 4 GB minimum, public IPv4.

### 6.1 Provision

1. Create the server in the Hetzner Cloud console; add your **SSH public key** at
   creation; disable password login.
2. Point `api` (A record) at the server's public IPv4.

### 6.2 Base hardening

```bash
# As root, once.
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh

# SSH: key-only, no root login.
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# Firewall: only SSH, HTTP, HTTPS.
apt-get update && apt-get install -y ufw fail2ban unattended-upgrades
ufw default deny incoming && ufw default allow outgoing
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban unattended-upgrades
```

### 6.3 Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy   # re-login afterwards
docker --version && docker compose version
```

### 6.4 Deploy

```bash
sudo mkdir -p /opt/sonivo && sudo chown deploy:deploy /opt/sonivo
git clone https://github.com/kevin-esq/sonivo.git /opt/sonivo
cd /opt/sonivo
cp deploy/env.production.example deploy/.env
# Edit deploy/.env: Neon prod connection string, R2, email, Google, ACME_EMAIL.
# NEVER commit deploy/.env.
cd deploy && docker compose --env-file .env up -d --build
```

### 6.5 Verify

```bash
curl -fsS https://api.sonivo.lat/api/health        # {"status":"ok"}
curl -fsS https://api.sonivo.lat/api/health/ready  # {"status":"ready"} (DB probe)
```

### 6.6 Updates

```bash
cd /opt/sonivo && git pull --ff-only
cd deploy && docker compose --env-file .env up -d --build
```

### 6.7 Caddy notes

- First boot may hit Let's Encrypt rate limits while iterating: temporarily
  uncomment the `acme_ca` staging CA in `deploy/Caddyfile`, then remove it.
- Caddy persists certificates in the `caddy_data` volume; back it up.
- Only Caddy binds 80/443; the API is reachable solely on the compose network.

---

## 7. Phase B — Vercel frontend (BFF)

1. Create a Vercel project from `kevin-esq/sonivo` with **Root Directory**
   `web/apps/app` (Turborepo is detected; build command `next build`).
2. Environment: `API_ORIGIN=https://api.sonivo.lat`,
   `NEXT_PUBLIC_ROOT_DOMAIN=sonivo.lat`, and `NEXT_PUBLIC_APP_HOST=app.sonivo.lat`
   (the last one enables the apex -> app handoff redirect).
3. Build **without** `NEXT_EXPORT=1` so Next runs as a server (BFF): its
   `beforeFiles` rewrites proxy `/api/:path*` and `/hubs/:path*` to
   `API_ORIGIN`. The App Router serves public marketing at `/`, identity under
   `/auth/*`, and product pages under `/app/*`. Its robots policy allows the
   marketing root while excluding private identity and product paths. Render
   staging now has a separate `sonivo-web` service whose
   API origin is the existing staging API. Assign `staging.sonivo.lat` to that
   service only after verifying the host-only cookie, CSRF, API proxy, realtime,
   auth, redirects, and response headers. Until then the current staging host
   and .NET static fallback remain active.
4. Add domains: `sonivo.lat`, `www.sonivo.lat`, `app.sonivo.lat`, and the
   wildcard `*.sonivo.lat`; follow Vercel's DNS targets for each.

**OPEN (integration item):** the SignalR hub guard compares the `Origin` header
to the API request host. Through the Vercel BFF the forwarded `Origin` is the
tenant host, not `api.sonivo.lat`, so the hub handshake needs the BFF to present
a same-host origin (or an explicit allow-list entry). Tracked as part of the
parity migration; do not weaken the guard with a wildcard.

---

## 8. Phase E — data

- **Neon:** create a `prod` branch (or a dedicated prod project). Keep two
  independent credentials: the constrained `sonivo_app` runtime role and a
  privileged migration/ownership role. Provision `sonivo_app` with a unique
  production secret, `LOGIN`, and
  `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`; it must not
  own tables/schema or inherit membership in the migration role. Create it
  through the provider's approved database administration path. If using
  `psql`, create the role without embedding a password in a script or command,
  then set its unique secret interactively with `\password sonivo_app`
  ([psql documentation](https://www.postgresql.org/docs/16/app-psql.html)) and
  store it in the production secret store. Do not reuse the local/CI password:

  ```text
  CREATE ROLE sonivo_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS;
  \password sonivo_app
  ```

  Run the role-creation statement only when `sonivo_app` is absent. If it
  already exists, inspect and correct its attributes instead of recreating it.
- **Production schema and principal rollout order (PROPOSAL):**
  1. Review the migration and classify it as additive/backward compatible or
     contract/destructive. Test `Up` and, where safe, `Down` on an isolated
     database copy. For a contract change, split expansion and contraction into
     separate releases; do not deploy a schema that the currently live API
     cannot tolerate.
  2. Before merging API code that depends on a new schema, use a controlled
     one-shot operator job from the reviewed release source to apply
     `dotnet ef database update` with `SONIVO_MIGRATION_CONNECTION`. Use the
     migration/ownership credential; never add it to the API container or its
     `.env`. Render auto-deploys `develop`, so a required migration is an
     explicit pre-merge gate, not an API startup action.
     If a compatible additive migration has already applied but its API PR is
     not merged, leave the unused schema in place, record the migration, and
     do not run `Down` automatically. Remove it only through an owner-reviewed
     rollback after confirming no deployed code depends on it. If a migration
     fails partway, inspect `__EFMigrationsHistory` and the actual schema before
     any retry or `Down`; never assume the whole batch committed or rolled back.
  3. On Sonivo's production database, remove the default `PUBLIC` temporary
     table capability and grant the runtime role access to this database while
     connected as its owner:

     ```sql
     DO $$
     BEGIN
         EXECUTE format('GRANT CONNECT ON DATABASE %I TO sonivo_app', current_database());
         EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM sonivo_app', current_database());
         EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
     END
     $$;
     ```

     The runtime role must not receive `TEMPORARY`; the verifier rejects it
     even when inherited from `PUBLIC`. PostgreSQL also grants `CONNECT` to
     `PUBLIC` by default. The verifier requires the runtime principal to have
     no effective `CONNECT` to any other connectable database. On a cluster
     dedicated to Sonivo, revoke `CONNECT` from `PUBLIC` and `sonivo_app` on
     each other connectable database:

     ```sql
     DO $$
     DECLARE
         database_record record;
     BEGIN
         FOR database_record IN
             SELECT datname
             FROM pg_database
             WHERE datallowconn
               AND datname <> current_database()
         LOOP
             EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', database_record.datname);
             EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM sonivo_app', database_record.datname);
         END LOOP;
     END
     $$;
     ```

     The operator must have authority to change CONNECT ACLs on every affected
     database and inspect/terminate the runtime role's sessions. This
     cluster-wide `PUBLIC` change can affect other roles: first confirm the
     cluster is dedicated or coordinate the impact with its operator. If
     shared workloads depend on that access, isolate Sonivo on a dedicated
     cluster/database or keep T-4.2.02 open; do not weaken the verifier. Check
     `pg_stat_activity` after revocation and terminate any remaining
     `sonivo_app` sessions to other databases because PostgreSQL checks
     `CONNECT` at session startup and revocation does not close existing
     connections ([privilege docs](https://www.postgresql.org/docs/16/ddl-priv.html)).

     Use the operator connection to inspect and, if rows are returned, end only
     `sonivo_app` sessions connected to another database:

     ```sql
     SELECT pid, datname
     FROM pg_stat_activity
     WHERE usename = 'sonivo_app'
       AND datname <> current_database()
       AND pid <> pg_backend_pid();

     SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE usename = 'sonivo_app'
       AND datname <> current_database()
       AND pid <> pg_backend_pid();
     ```
  4. After migrations create the complete schema, run
     `scripts/db/grant-runtime-privileges.sql` as a principal allowed to grant
     the reviewed DML privileges to `sonivo_app`.
  5. Load the exact runtime connection string intended for the API from its
     secret store and run `scripts/db/verify-runtime-principal.sql` through that
     connection. Its PostgreSQL `session_user` and `current_user` must both be
     `sonivo_app`; role-attribute, database-privilege, schema/ownership,
     inheritance, and migration-history checks must pass
     before API rollout.
  6. Configure the API with that same constrained runtime credential. The
     connection string uses `SSL Mode=VerifyFull`, so Npgsql verifies both the
     server certificate and host name ([Npgsql SSL guidance](https://www.npgsql.org/doc/security.html));
     never set `Trust Server Certificate=true`. Leave
     `SONIVO_MIGRATE_ON_START` unset in Production.
  7. Merge the reviewed API change only after the privileged migration, grant
     review, and runtime verifier pass. After Render auto-deploy, record the
     commit and migration IDs, confirm the startup log says
     `RLS runtime principal and forced-policy verification passed.`, and check
     `/api/health/ready` before treating the rollout as complete.
- **Automation status:** this repository currently has CI migration jobs for
  ephemeral PostgreSQL only; it does not contain a production migration
  workflow. Production schema rollout therefore remains an operator-run,
  one-shot deployment step. The pre-merge ordering above is an operator gate;
  CI does not enforce it. Do not treat the CI job or the API startup as the
  production migration job.
- **RLS incident response (PROPOSAL):** if image build fails, confirm the last
  live Render commit and readiness before retrying; do not change the database.
  If startup verification or readiness fails after deploy, stop merges and
  migrations. Record the deploy ID, commit, migration IDs, timestamps, and
  secret-safe verifier output; never copy connection strings or credentials to
  logs or tickets. Confirm the active Render deployment before taking action.
  If the previous API image is compatible with the schema, roll back the API
  while preserving the schema. If it is not compatible, prepare and test a
  forward-fix migration on an isolated copy. Use Neon point-in-time restore only
  after an owner-approved recovery point and explicit assessment of the data-loss
  window; never restore production automatically. After recovery, rerun the
  runtime verifier, readiness check, and tenant-isolation smoke checks. **FACT
  (2026-11-22):** isolated rehearsals verified migration `Up`/`Down` for PR #374
  and API fail-closed startup/recovery after restoring forced RLS. No production
  fault injection, Render image rollback, or Neon point-in-time restore was
  performed. Keep those recovery actions operator-only; verify the selected
  procedure on a disposable copy before using it against production.
- **R2:** create `sonivo-prod` and wire `R2__*` on the VPS; staging keeps its own
  bucket. Buckets are never shared across environments.
- **Backups:** Neon point-in-time restore; R2 versioning/lifecycle as needed.

---

## 9. Email in production

`Email:Transport` is chosen per host capability. On Hetzner, outbound SMTP
(587) is allowed, so either transport works; use `api` if the SMTP path is
undesirable. The sender stays `Sonivo <notificaciones@sonivo.lat>` (never
`no-reply`). No vendor name appears in source (ADR-0068).

---

## 10. Acceptance smoke tests (after owner deploys)

- [ ] `https://sonivo.lat` serves marketing; `https://app.sonivo.lat` serves the product.
- [ ] `https://<slug>.sonivo.lat` reaches the group workspace; the API enforces membership.
- [ ] `https://api.sonivo.lat/api/health` and `/api/health/ready` are OK.
- [ ] Cross-subdomain login works via handoff with a **host-only** cookie (inspect DevTools → Application → Cookies: no `Domain`).
- [ ] Reserved/invalid slugs are rejected server-side.
- [ ] Email sends and is **Delivered**.
- [ ] `dotnet test Sonivo.slnx`, frontend build and Playwright critical journeys pass.

---

## 11. Secrets

Secrets live in the VPS `deploy/.env` (never committed), Vercel environment, and
provider consoles (Neon, R2, email, Google). Use Infisical or the provider's
secret store for anything shared. Never paste secrets into tickets, docs or chat.
