# Design note — Phase 4.9 (Organization) and 4.10 (Billing)

**Status:** **PROPOSED / NOT SCHEDULED** — no code, no migration. Business decisions pending.
**Scope:** one page. Design intent only; nothing here authorizes implementation.

## Why this note exists

Phases 4.9 (Organization) and 4.10 (billing) require business decisions that are not the
engineering team's to make (who owns several groups under one brand, what is charged, to whom).
Per the current task they are **OUT OF SCOPE**: this note records the shape so the door stays
open, without building anything.

## 4.9 — Organization (optional)

**Idea.** An `Organization` owns one or more Groups and, eventually, the branding/domain rows.
`Group` stays the tenant for authorization (ADR-0005 / ADR-0045); the Organization only groups
Groups for presentation and, later, billing.

**Supuesto (default if ever approved).**
- Additive tables: `Organization (Id, Name, Slug, CreatedAt, DeletedAt, Version)` and a nullable
  `Group.OrganizationId`. **No** change to the AuthZ path: membership stays per Group.
- "My groups" gains a grouping header; a user may belong to several groups of the same org.
- Branding tables (`GroupBranding`) are keyed by `GroupId` today and can be **re-keyed** to
  `OrganizationId` with one `ALTER TABLE` when a real multi-group customer appears.

**Preguntas (no answer yet).** Does an Organization own billing and quotas? Who administers it?
Do members inherit anything across its groups? Until answered, **build nothing**.

## 4.10 — Billing (optional)

**Idea.** Plans + quotas per Organization (or per Group if 4.9 never lands). ADR-0042 keeps
payments **OUT**; any billing work **reopens ADR-0042** explicitly.

**Supuesto (default if ever approved).**
- Provider-agnostic seam: `IBillingProvider` + webhook endpoint with signature verification;
  no provider SDK inside the domain.
- Quotas expressed as policies, not scattered `if` checks (e.g. max members, max blob storage).
- Never store card data; only provider customer/subscription ids.

**Preguntas (no answer yet).** What is free vs paid? Who is the payer (Owner vs Organization)?
Currency/tax for Mexico? Until answered, **build nothing**; the `onrender.com` host and the
missing domain (D2) also block public pricing surfaces.

## Firewalls

- This note changes **no** accepted ADR and adds **no** entity, migration or endpoint.
- 4.6/4.7 (subdomain/custom domain) remain **BLOCKED** on owning a real domain.
- 4.9/4.10 stay **FUTURE** until a business decision and a superseding ADR exist.
