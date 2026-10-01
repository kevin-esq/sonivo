# Phase — White label, managed accounts and .lrc lyrics

**Status:** **PLAN (PROPOSED)** — approved with corrections 2026-10-01; not implemented.
**Owner:** Kevin Esquivel · **Branch:** `docs/white-label-plan`
**Baseline:** the code, not the docs. Verified reading order: `Group` → `Membership` → `Invitation`,
`ApplicationUser`, cookies/antiforgery (`Program.cs:45-102`), `PasskeyOrigins`, `GoogleAuthSetup`,
`ConfigurationPublicOrigin`, `SonivoDbContext`, frontend shell.
**Spikes:** [`.scratch/spikes/README.md`](../../.scratch/spikes/README.md) (results + one security incident).

> Claim labels: **HECHO** verified in code/docs · **SUPUESTO** assumed · **PREGUNTA** open (with default).

---

## 1. Executive summary

Sonivo evolves from "one Group = one tenant with a shared UI" to a **white-label platform** with
**Owner-managed member accounts** and **`.lrc` lyrics**, without leaving the modular monolith.

1. **Tenancy** — keep **Group as tenant** (Option A) and put branding/domains in their own tables, so
   they can later be re-keyed to an `Organization` without a rewrite. Organization>Group is deferred
   (real cost in AuthZ + "my groups" presentation, no proven demand). **HECHO** today there is no
   Organization entity and isolation is `Groups.RequireMember → 404`.
2. **Accounts** — **hybrid**: a roster row (`Membership` with a nullable `UserId`) is always created; an
   Identity account is created **only when the Owner grants access**, and only then is it resettable by
   that Owner (`ManagedByGroupId`). With email → **activation link** (the Owner never sees a password);
   without email → **username `handle@slug` + temporary password**.
3. **Domains** — **branding in-app first** (single origin: cookies, passkeys, Google and CSRF unchanged);
   **subdomain later** for branded/public surfaces with **central auth + one-time code**; **custom domain
   last**. `onrender.com` is a public suffix, so white-label subdomains/passkeys require a **real domain**.

**Effort:** ~**17–23 weeks** (1 senior dev) for phases 4.0–4.8; 4.9–4.10 optional. §9.

---

## 2. Findings (verified) and contradictions with CONTEXT.md

### 2.1 HECHO — verified
| Area | Fact |
| --- | --- |
| Tenancy | `ADR-0005`: Group = tenant, no Organization. `GroupAccessService` requires membership; **non-member → 404** (no existence leak) |
| `Group` | only `Id, Name(≤200), CreatedAt, UpdatedAt, DeletedAt, Version` — no slug, no branding |
| `Membership` | `Id, GroupId, UserId (required), Role(Owner\|Member), CreatedAt` |
| `Invitation` | `GroupId, TokenHash, CreatedByUserId, ExpiresAt, AcceptedAt/ByUserId` — no recipient field |
| User | `ApplicationUser : IdentityUser<Guid>` + `DisplayName`; login by email; email verification mandatory (`ADR-0038`) |
| Cookies | `sonivo.auth` HttpOnly, Secure(non-dev), **SameSite=Lax**, sliding 14 d, **no `Domain` ⇒ host-only**; antiforgery `sonivo.csrf` SameSite=Lax, HttpOnly=false |
| CSRF/topology | `ADR-0020`: same-site, **no credentialed CORS**, double-submit + `Origin` check |
| `PublicOrigin` | a **single** config value used for absolute links |
| Google | `CallbackPath=/api/auth/google/response` on the app origin; **redirect URIs have no wildcards** |
| Passkeys | `rpId = config["Passkeys:RelyingPartyId"] ?? request.Host.Host`; allowed origins = `Passkeys:AllowedOrigins` CSV ?? `PublicOrigin` + localhost(dev) |
| Lyrics | ChordPro + **per-line timing marks** (`ADR-0031`); Whisper (`ADR-0032/0034`) yields marks + draft lyrics; **no `.lrc`** |
| Schema | 12 tables: Group, Membership, Invitation, Song, Arrangement, Resource, Setlist, SetlistItem, Event, EventSetlistItem, Rsvp, DataProtectionKey. No roster/branding/org/payment |
| Billing | **reverted** (`ADR-0042`): no payment entities remain; only orphan migration files |

### 2.2 Documentation vs code
- **CONTEXT.md is stale** (`Last updated: 2026-09-28`): it does not mention the shipped **W6–W9** UI polish
  (PRs #122–#165) nor **AppHeader W1** (PR #165). The code wins → update it on this branch.
- Path in the brief (`docs/01-context/CONTEXT.md`) is wrong: it is **`docs/00-context/CONTEXT.md`**. **HECHO**
- Passkey storage is not a `DbSet` → **SUPUESTO** managed by Identity (.NET 9). Verify in phase 4.7.

### 2.3 Security findings
- `.env.production.local` holds real secrets but is **untracked and gitignored** (`.gitignore:3 .env.*`). **OK**
- Tracked `appsettings.json` / `appsettings.Development.json` contain a **non-empty local DB password**
  (localhost). **LOW** risk; move to user-secrets/env and add a **secret-scan gate** (gitleaks) to CI.
- `R2.AccessKey` / `R2.Secret` in tracked `appsettings.json`: **empty**. **OK**
- **MCP browser profile carries real sessions** (see the incident in the spikes README): isolate the
  profile and rotate the production session.

---

## 3. Rule-change register

| Rule / ADR | Change | Why | Replaced by |
| --- | --- | --- | --- |
| `ADR-0005` (no Organization) | becomes "not in MVP"; future Organization allowed | phase change | **ADR-0045** |
| `CONTEXT` PROHIBITIONS #3 | Organization moves to FUTURE | idem | ADR-0045 + CONTEXT |
| `ADR-0038` mandatory email verification | exception for **managed accounts without email** | Owner may create access without a mailbox | **ADR-0046/0047** |
| `ADR-0012` (Owner\|Member only) | extended roles + musical role | section permissions | **ADR-0051** |
| `ADR-0020` cookie posture | reaffirmed; adds **host-only session per host** + central-auth code exchange | subdomains/custom domains | ADR-0020 **amend** + **ADR-0049** |
| `PHASE-3.9` firewall (no Event/RSVP mail) | reopened for notifications | value, Gmail API already present | **ADR-0052** |
| `ADR-0042` Payments OUT | stays OUT unless 4.10 is approved | no demand yet | unchanged |
| `i18n ajustes.logoNote` ("logo soon") | logo is now in scope | white label | ADR-0048 |

---

## 4. Proposed ADRs (PROPOSED)

> Kept here as **drafts**; on approval they move into `DECISIONS.md` per the repo change protocol.

| ADR | Status | Supersedes / amends |
| --- | --- | --- |
| ADR-0045 | PROPOSED | **supersedes ADR-0005** (Organization prohibition) |
| ADR-0046 | PROPOSED | **amends ADR-0005 / ADR-0012** (membership + roles baseline) |
| ADR-0047 | PROPOSED | **supersedes the "email required for access" part of ADR-0038** |
| ADR-0048 | PROPOSED | new (per-group white label) |
| ADR-0049 | PROPOSED | **amends ADR-0020** (cookie posture) |
| ADR-0051 | PROPOSED | **supersedes the Owner\|Member-only role list of ADR-0012** |
| ADR-0052 | PROPOSED | **amends the PHASE-3.9 mail firewall** |

### ADR-0045 — Tenancy: Group as tenant with branding; Organization deferred
**Options.** A) Group = tenant + branding/domain tables. B) Organization > Group (branding/domain owned by
the org; AuthZ gains an org layer; "my groups" must group by org). C) realm per group (rejected: duplicates
identity, kills multi-group users that ADR-0005 protects).
**Decision.** **A**, with `GroupBranding`/`GroupDomain` keyed by `GroupId` so they can be re-keyed to
`OrganizationId` later. B only when a real customer needs several groups under one brand.
**Consequences.** AuthZ untouched; no rewrite; B is one `ALTER TABLE` away.

### ADR-0046 — Roster + optional managed account (hybrid)
`Membership` absorbs the person (one entity: **see §4.b of the correction list**); `UserId` becomes nullable;
an Identity account is created only when access is granted, tracked by `ApplicationUser.ManagedByGroupId`.

### ADR-0047 — First-access credentials and pre-hijacking defences
- With email: **activation link only** (single-use, expiring). The Owner **never sees a password**.
- Without email: **temporary password** (random, single-use, expiring, shown once, never logged) + a
  server-enforced `MustChangePassword`.
- **No automatic linking** of accounts whose email is **unverified** to Google/external providers; before
  linking, **revoke existing credentials** (passkeys/temp tokens) and notify.
- Permanent notice in the account UI: **"cuenta administrada por el grupo X"**.
- `MustChangePassword` blocks the whole API except `me` / `logout` / `change-password`.
- Rate limit + lockout + `AccountAudit` (IDs only).

### ADR-0048 — Per-group white label
`GroupBranding` table; strict colour validation (hex only, AA contrast computed server-side, never free CSS);
sanitised texts; logo via `IBlobStore` with size limit + image re-encode; per-group CSS variables; optional
"Con tecnología de Sonivo".

### ADR-0049 — Public hosts and custom domains
1. Branding in-app, single origin. 2. Subdomain for branded/public surfaces with **central auth + one-time
code** (never a parent-domain cookie). 3. Custom domain last: Host resolution + **host-only cookie** +
ownership verification (TXT/CNAME) + per-domain TLS; **passkeys disabled by default** (different rpId).
`onrender.com` is a **public suffix** → white-label subdomains require a **real domain**. **PREGUNTA**: Render's
custom-domain/wildcard capabilities could not be verified from this machine.

### ADR-0050 — `.lrc` as an import/export format
`.lrc` is **not** a stored format: it is parsed into **ChordPro + ADR-0031 line marks**, and exported back.
No `Arrangement.LyricsFormat` column. Encoding: UTF-8 (with/without BOM) and **UTF-16 BOM detection**;
**Windows-1252 fallback only with an explicit warning**; otherwise reject with a clear message. Enhanced
(word-level) LRC is **lossy by design** in v1 (line marks only), stated in the import preview.

### ADR-0051 — Roles and permissions (optional)
`Owner|Manager|Member|Viewer` + musical role on the membership row. No generic ACL engine.

### ADR-0052 — Email notifications (reopens PHASE-3.9 firewall)
Event/RSVP mail via the existing Gmail API; members without email get in-app only.

---

## 5. Data model

```text
Group                 (+) Slug varchar(60) UNIQUE (deleted groups keep a reserved slug)
GroupBranding         (new) GroupId PK/FK, DisplayName?, LogoBlobKey?, LogoContentType?,
                            AccentHex char(7)?, CoverKind?, CoverValue?, ThemeDefault,
                            DefaultLocale, WelcomeText?, LoginHeadline?, ShowSonivoCredit, Version
GroupDomain           (new, 4.7) Id, GroupId FK, Host UNIQUE, Kind(subdomain|custom),
                            VerificationStatus, VerificationTokenHash, VerifiedAt
Membership            (unified; see correction §(b))
   Id, GroupId FK, UserId GUID NULL, Role, DisplayName, ContactEmail?, ContactPhone?,
   Instrument?, Notes?, Status(active|archived), CreatedByUserId, CreatedAt
   CHECK (Role = 'Owner' => UserId IS NOT NULL)
   UNIQUE (GroupId, UserId) FILTER (UserId IS NOT NULL)
   Handle varchar(32) NULL, UNIQUE (GroupId, Handle) FILTER (Handle IS NOT NULL)
ApplicationUser       (+) ManagedByGroupId GUID NULL, MustChangePassword bool
AccountAudit          (new) Id, ActorUserId, TargetUserId, GroupId?, Action, CreatedAt
Arrangement           (unchanged: no LyricsFormat column)
Slug rules            immutable once set; no dots; reserved list; deleted-group slugs stay reserved
Handle rules          [a-z0-9._-]{3,32}; stored separately from GroupId (never a single "handle@slug" string)
```
**Indexes:** `Group.Slug`, `GroupDomain.Host`, `Membership(GroupId, Handle)`, `Membership(GroupId, UserId)`,
`AccountAudit(TargetUserId, CreatedAt)`.
**Roster-only invariant:** a row with `UserId IS NULL` is a person, **never** an authenticated member.

---

## 6. API changes (additive)

| Route | Change |
| --- | --- |
| `GET/POST /api/groups/{gid}/members` | roster; create with `{ grantAccess, credential: activation_link\|temporary_password }` |
| `POST …/members/{id}/reset-access` | re-issue activation/temp; requires `ManagedByGroupId == gid` |
| `POST …/members/{id}/link` | link to an existing account by email (no existence leak) |
| `POST /api/auth/change-password` | enforced before any other mutation while `MustChangePassword` |
| `GET/PUT /api/groups/{gid}/branding` · `POST …/branding/logo` | branding |
| `POST /api/arrangements/{id}/lyrics/import-lrc` · `GET …/export.lrc` | LRC import/export (+ `offsetMs`) |
| `GET /api/auth/exchange` (4.6+) | one-time code redemption on the target host |
| `GET /api/groups/{gid}/export` | GDPR-style export (members + repertoire) |

**Exchange contract (correction a):** the tenant host sets a **host-only `state` cookie**, passes `state` +
a signed `target` to the central auth host, and **compares the echoed `state` against its cookie** at
redemption (SPIKE-4: login-CSRF → `400`). Responses carry **`Referrer-Policy: no-referrer`**, and the final
redirect is **immediate and parameter-free** (`303 → /app`). Errors: `400 csrf_state_mismatch`,
`409 already_used`, `410 expired`, `400 host_mismatch`.

---

## 7. Frontend

- Blocking **change-password modal** on first access with a temporary credential (no escape).
- **Group switcher** in the header (already ticketed in `PHASE-APP-HEADER-SPEC`).
- **BrandingProvider**: per-group CSS variables + copy; branded login on public surfaces.
- **LRC importer**: paste/upload, preview against the track, **offset** control, explicit warnings for
  Windows-1252 fallback and lossy enhanced-LRC; "Export .lrc".
- **Roster UI**: quick create, `sin acceso / con acceso` badge, resend activation, link.
- i18n (es/en): `miembros.grantAccess`, `miembros.activationSent`, `miembros.managedNotice`,
  `auth.mustChangeTitle`, `marca.accent`, `lrc.import`, `lrc.offset`, `lrc.encodingWarning`, `lrc.export`.

---

## 8. Threat model

| # | Threat | Mitigation |
| --- | --- | --- |
| 1 | **Cross-tenant data access** | membership-required AuthZ server-side; non-member → 404; per-endpoint isolation tests |
| 2 | **Session theft across subdomains** | **host-only cookie per host**; central auth + one-time code; never a parent-domain cookie |
| 3 | **Login CSRF via code injection** | `state` in a host-only cookie compared at redemption; host-bound single-use code (SPIKE-4 14/14) |
| 4 | **Temporary-password abuse** | one per person, single-use, expiring, shown once, never logged; rate limit + lockout |
| 5 | **Pre-hijacking** | activation link when an email exists (Owner never sees a password); no auto-link of unverified emails; revoke prior credentials before linking; "managed by group X" notice |
| 6 | **User enumeration** | uniform responses/timings; rate limit per `(slug, IP)`; never reveal whether an email exists |
| 7 | **Subdomain takeover** | reserved slug list; ownership verification; dangling-CNAME detection; managed TLS |
| 8 | **XSS via branding/lyrics** | hex-only colours validated server-side (AA), sanitised text, React escaping, CSP (ADR-0044) |
| 9 | **Malicious uploads** | 5 MiB cap, type allowlist, image re-encode, `Content-Disposition` |
| 10 | **Open redirect / OAuth** | keep `OAuthNext.Sanitize`; explicit Google redirect URI (central host only) |

---

## 9. Phases

> Numbering continues the repo (last closed: 3.9 + ADR-0044). Order validates the brief's suggestion
> (LRC + managed accounts first, domains last) with one change: **branding before domains**.

| Phase | Goal | Depends | Acceptance |
| --- | --- | --- | --- |
| **4.0** Rules & docs | ADR-0045…0052, CONTEXT/DECISIONS/GLOSSARY | — | no contradictions; claims labelled |
| **4.1** Managed accounts | roster + access + activation/temp + `MustChangePassword` + audit | 4.0 | Owner creates a member without an account; person must change credential before using the API; export + scheduled deletion + Owner transfer covered |
| **4.2** `.lrc` | parse → ChordPro + line marks; import/preview/offset/export | 4.0 | valid → marks; corrupt → `400 errors[{line,reason}]`; round-trip lossless at line level; UTF-16 BOM detected; 1252 fallback warns |
| **4.3** Branding | `GroupBranding` + tokens + logo | 4.1 | accent/cover persist server-side and appear on another device; invalid colour → 400; AA ≥ 4.5 |
| **4.4** Roles | `Owner\|Manager\|Member\|Viewer` + musical role | 4.1 | section permissions + 403 tests |
| **4.5** Stage mode | large lyrics/chords, autoscroll on LRC, wake lock | 4.2 | autoscroll follows the track; legible at 3 m |
| **4.6** Branded subdomain | Host resolution (read), central auth + code exchange | 4.3 | `slug.domain` shows the brand; auth central; no cross-group cookie; exchange verified (SPIKE-4) |
| **4.7** Custom domain | Host↔tenant + verification + TLS + passkeys per host | 4.6 | verified domain serves the group; host-only cookie; passkeys re-registered or disabled |
| **4.8** Notifications | event/RSVP email + ICS | 4.1 | member with email gets it; without email → in-app |
| **4.9** Organization (opt) | re-key branding/domain | 4.4 | only with a multi-group customer |
| **4.10** Billing (opt) | plans + quotas | 4.9 | reopens ADR-0042 |

**4.1 re-estimate (correction f)** — now includes export, scheduled deletion of managed accounts, Owner
transfer, and the blocking modal with E2E:

| Item | Days (1 senior) |
| --- | --- |
| Schema + EF migration (roster + nullable UserId + `CHECK` + `Handle` + `AccountAudit`) | 2–3 |
| Owner creates roster/access + activation link | 3–4 |
| Temporary password + `MustChangePassword` server-side | 1.5–2 |
| `reset-access` + `link` + `ManagedByGroupId` rules + audit | 2–3 |
| Roster UI + blocking modal + i18n es/en | 3–4 |
| Group export + scheduled deletion of managed accounts + Owner transfer | 2–3 |
| E2E (isolation, enumeration, forced change) + security tests | 2–3 |
| Integration buffer | 2 |
| **Total** | **17–24 dp ⇒ ~3.5–5 weeks** (opt. 3 · real. 4 · pess. 6) |

**Assumptions:** 1 dev full-time; no review latency; Identity reset tokens reused; no mail-provider change;
2FA not forced on managed accounts. **Impact:** 4.0–4.8 ≈ **17–23 weeks** (up from the earlier 16–22).

---

## 10. Migration strategy (no downtime, no production touch)

1. **Additive first**: new tables/columns nullable (`Slug`, `ManagedByGroupId`, `MustChangePassword`,
   `Handle`, `AccountAudit`); nothing is altered destructively.
2. **Backfill `Membership`**: every existing row keeps `UserId`; `DisplayName` copied from the user.
   `Membership.Handle` stays NULL for existing rows.
3. **`Slug`**: slugify `Name`, resolve collisions, create the unique index **after** the backfill
   (`CREATE UNIQUE INDEX CONCURRENTLY`). Deleted-group slugs stay **reserved**.
4. **`CHECK (Role='Owner' => UserId NOT NULL)`** added after the backfill (all existing owners have a user).
5. **Passkeys**: today `rpId = request host`. Moving to `sonivo.app` **invalidates** credentials created on
   the old host → users re-register; keep a grace path (detect the old rpId, prompt re-enrolment).
6. **Invitations already sent / `PublicOrigin`**: keep the canonical link working; introduce the new host
   only in phase 4.6 with a redirect from the old host. `PublicOrigin` becomes per-host (4.6).
7. **Google redirect URI**: add the central auth host as a **new** redirect URI (no wildcards); leave the old
   one until the cut-over, then remove.
8. **Cookies**: host-only is preserved; no parent-domain cookie is ever introduced.
9. **Rollback**: per-phase feature flags; EF `Down()` rehearsed locally; production is never touched here.

---

## 11. Test plan

- **TC-LRC-01…06** (valid, 3 decimals, multi-mark, unordered, UTF-16 BOM, invalid 1252 + warning, corrupt).
- **TC-MBR-01** roster without account; **02** one-time activation; **03** temp + forced change; **04** link
  without duplication/enumeration; **05** `reset-access` refused when `ManagedByGroupId` differs.
- **TC-ISO-01…n** per new endpoint: a member of A cannot act on B; non-member → 404.
- **TC-EXC-01…04** (from SPIKE-4): single use, expiry, login-CSRF, host-only.
- **TC-BRD-01/02** branding persists; invalid colour rejected; AA checked.
- **E2E with subdomains**: requires HTTPS locally (**mkcert**) — SPIKE-3 blocked on plain HTTP.
- **Security**: rate-limit, enumeration, pre-hijacking, XSS via branding/lyrics.
- **Secret scan** (gitleaks) in CI.

---

## 12. Recommended features (priority)

| # | Feature | Value | Effort | Risk | Phase |
| --- | --- | --- | --- | --- | --- |
| 1 | Managed accounts + roster | High | M | Med | 4.1 |
| 2 | `.lrc` | High | M | Low | 4.2 |
| 3 | Server-side branding | High | M | Med | 4.3 |
| 4 | Fine roles + musical role | Med | M | Low | 4.4 |
| 5 | Stage mode | High | M | Low | 4.5 |
| 6 | Notifications + ICS | High | M | Med | 4.8 |
| 7 | Subdomain → custom domain | Med | L | High | 4.6–4.7 |
| 8 | CSV bulk add / template / duplicate group | Med | S | Low | 4.1/4.4 |
| 9 | Global search ⌘K + group switcher | Med | S | Low | header phase |
| 10 | PDF/print export | Med | M | Low | 4.5 |
| 11 | Per-group audit log | Med | S | Low | 4.4 |
| 12 | PWA/offline | Med | L | Med | 4.9 |
| 13 | Availability/agenda | Med | M | Low | 4.8 |
| 14 | Public group page | Low | S | Med | 4.6 |
| 15 | Billing | Med | L | High | 4.10 |

---

## 13. Privacy (correction g)

> **This section requires review by a lawyer under the applicable Mexican law.** It states product
> intentions, not legal conclusions, and does not assert specific legal duties that cannot be verified.

**Roles (product intent).** The **group** decides what member data it collects; **Sonivo** stores it on the
group's behalf. The Owner is expected to inform members that their data is entered into Sonivo and to have
a legitimate reason to do so.

**Data minimisation.** Name + one access identifier are enough. Phone, instrument and notes are **optional**
and must have a declared purpose. **Phone is contact-only in v1**; if messaging is enabled (4.8) it needs a
separate, explicit consent and a cost estimate.

**Notice.** A short privacy notice is shown at first access and on the invitation; it states that the account
is **managed by the group** when applicable.

**Export.** A group can export its members + repertoire; a person can export their own data.

**Deletion.** Roster entry deletion; **managed account** deletion only if `ManagedByGroupId` is active and the
person belongs to no other group (otherwise the account stays and the mark is cleared); deleting a group
schedules deletion of the accounts it created and that are used only there, with notice.

**Owner transfer.** The `ManagedByGroupId` mark belongs to the **group**, so a new Owner inherits reset power;
this is logged in `AccountAudit` and the member is notified (risk of one person reaching another's identity).

**Audit.** `AccountAudit` stores **IDs, not personal content**.

---

## 14. Risks and open questions (each with a default)

| # | Question | Default |
| --- | --- | --- |
| Q1 | Organization now? | No; 4.9 only with a multi-group customer |
| Q2/Q3 | Login per subdomain / parent-domain cookie? | No / No (central auth + one-time code) |
| Q4 | Non-email identifier? | `handle@slug`, `Handle` + `GroupId` stored separately; Owner-mediated reset |
| Q5 | `.lrc` Latin-1? | Windows-1252 fallback **with warning**; otherwise reject |
| Q6 | Enhanced (word-level) LRC? | Lossy in v1; extend marks later |
| Q7 | Force 2FA on managed accounts? | No; Owner decides |
| Q11 | Does Owner transfer inherit reset power? | Yes, with audit + member notice |
| Q12 | Passkeys on custom domains? | Off in v1 |
| Q13 | Does white-label need a real domain? | **Yes** — `onrender.com` is a public suffix (subdomains are shared with other tenants) |
| Q14 | Hosting/TLS/wildcard support (Render)? | **PREGUNTA** — unverifiable from this machine; verify before 4.6 |
| Q15 | Are managed accounts deletable without the group? | Only if the mark is active and there is no other group |

---

## 15. Appendix

**Tools installed:** none beyond what the repo already had. SPIKE-3 reuses the Playwright browsers already
present under `e2e/`; SPIKE-1/4 use plain Node. No new dependency is added to the product.

**Spikes:** `.scratch/spikes/README.md` (+ `spike3-passkeys.mjs`, `spike4-code-exchange.mjs`).

**Security incident:** while reading the MCP browser cookie jar (SPIKE-2) I observed a real session cookie
for `sonivo.onrender.com`. **No navigation, request, login or write was performed against it** — the call was
`page.context().cookies()`, an in-memory read. Actions recommended: isolate the automation profile and rotate
the production session. Recorded in full in the spikes README.

**Files this plan would touch (read-only today):** `src/Sonivo.Domain/Tenancy/{Group,Membership,Invitation}.cs`,
`src/Sonivo.Infrastructure/Identity/ApplicationUser.cs`, `Persistence/SonivoDbContext.cs`,
`Api/Program.cs` (cookies/endpoints), `Api/Auth/PasskeysAuth.cs`, `Api/Auth/GoogleAuthSetup.cs`,
`Infrastructure/ConfigurationPublicOrigin.cs`, `web/sonivo-web/src/{api/client.ts,i18n/index.tsx,shell/*,tenancy/*,repertoire/*}`.
