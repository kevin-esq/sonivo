---
name: decision-record
description: Create or maintain Sonivo architecture decision records when a material product, domain, security, architecture, or tooling decision needs a durable rationale.
---

# Decision Record

Use an ADR when a choice has lasting consequences or future contributors will need to understand why it was made.

## Sonivo workflow

1. Check `AGENTS.md` and the latest entries in `docs/03-architecture/DECISIONS.md`.
2. Confirm the user has authorized the decision and scope. Do not infer authorization from implementation approval or a request to continue.
3. Add the next numbered ADR to `DECISIONS.md`, following its existing structure and status vocabulary (`PROPOSED`, `ACCEPTED`, `SUPERSEDED`).
4. Record context, decision, alternatives, consequences, scope boundaries, and links where useful.
5. Do not edit an accepted ADR in place to change its meaning; add a superseding decision when required.
6. Update `CONTEXT.md`, affected specs, and tooling policy only after the decision status permits it.

Do not create a parallel `knowledge/04-decisions/` tree or apply a generic ADR template that conflicts with Sonivo's conventions. If scope is unclear or conflicts with an accepted ADR, stop and ask rather than silently changing the decision.
