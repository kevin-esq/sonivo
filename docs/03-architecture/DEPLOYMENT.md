# DEPLOYMENT.md — Sonivo production topology, host map and runbooks

**Status:** **FACT** for the decided topology and host map; **OPEN** until the
owner contracts Hetzner and creates the Vercel project (no cloud account is
provisioned by this document). Staging remains on Render (`staging.sonivo.lat`).

Canonical decisions: **ADR-0067** (Next.js BFF, host-based tenancy, handoff
session) and **ADR-0069** (production topology). Related: ADR-0035 (R2),
ADR-0049 (hosts/subdomains), ADR-0068 (email transport), ADR-0020 (CSRF).

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
- **Production schema and principal rollout order:**
  1. From the approved release source, a controlled one-shot deployment job
     applies `dotnet ef database update` with `SONIVO_MIGRATION_CONNECTION`.
     The job uses the migration/ownership credential; it is never added to the
     API container or its `.env`.
  2. On Sonivo's production database, remove the default `PUBLIC` temporary
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
  3. After migrations create the complete schema, run
     `scripts/db/grant-runtime-privileges.sql` as a principal allowed to grant
     the reviewed DML privileges to `sonivo_app`.
  4. Load the exact runtime connection string intended for the API from its
     secret store and run `scripts/db/verify-runtime-principal.sql` through that
     connection. Its PostgreSQL `session_user` and `current_user` must both be
     `sonivo_app`; role-attribute, database-privilege, schema/ownership,
     inheritance, and migration-history checks must pass
     before API rollout.
  5. Configure the API with that same constrained runtime credential. The
     connection string uses `SSL Mode=VerifyFull`, so Npgsql verifies both the
     server certificate and host name ([Npgsql SSL guidance](https://www.npgsql.org/doc/security.html));
     never set `Trust Server Certificate=true`. Leave
     `SONIVO_MIGRATE_ON_START` unset in Production.
- **Automation status:** this repository currently has CI migration jobs for
  ephemeral PostgreSQL only; it does not contain a production migration
  workflow. Production schema rollout therefore remains an operator-run,
  one-shot deployment step. Do not treat the CI job or the API startup as that
  production migration job.
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
