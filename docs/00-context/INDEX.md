# Sonivo Knowledge Index

This is the Obsidian entry point for durable project knowledge. It is a navigation page, not an independent source of truth.

## Project context

- [Project context](CONTEXT.md)
- [Glossary](GLOSSARY.md)
- [Product requirements](../01-product/PRODUCT.md)
- [Personas](../01-product/PERSONAS.md)
- [Domain model](../02-domain/DOMAIN-MODEL.md)
- [Domain language](../02-domain/DOMAIN.md)

## Architecture and delivery

- [Architecture decisions](../03-architecture/DECISIONS.md)
- [Architecture](../03-architecture/ARCHITECTURE.md)
- [Deployment and host map](../03-architecture/DEPLOYMENT.md)
- [API](../03-architecture/API.md)
- [Security](../03-architecture/SECURITY.md)
- [Persistence](../03-architecture/PERSISTENCE.md)
- [Testing strategy](../03-architecture/TESTING.md)
- [Phase specifications](../03-architecture/)
- [Phase 4.0 — Insights, audit, onboarding, and Help](../03-architecture/PHASE-4.0-INSIGHTS-HELP-SPEC.md)
- [Phase 4.1 — Hierarchical repertoire access](../03-architecture/PHASE-4.1-RESOURCE-ACCESS-SPEC.md)
- [Phase 4.2 — PostgreSQL row-level security](../03-architecture/PHASE-4.2-POSTGRESQL-RLS-SPEC.md)
- [Web surfaces and route ownership](../03-architecture/PHASE-WEB-BOUNDARIES-SPEC.md)
- [Native mobile clients](../03-architecture/PHASE-MOBILE-NATIVE-SPEC.md)
- [User-visible placeholder completion](../03-architecture/PHASE-USER-SURFACE-COMPLETION-SPEC.md)
- [PostgreSQL RLS research](../03-architecture/POSTGRESQL-RLS-RESEARCH.md)
- [Media upload research](../03-architecture/MEDIA-UPLOAD-RESEARCH-2026-10.md)
- [Plan-aware media upload specification](../03-architecture/PHASE-MEDIA-UPLOADS-SPEC.md)
- [Tooling policy](../tooling/TOOLING-AUDIT.md)

## Product design

- [UX guidelines](../design/UX_GUIDELINES.md)
- [Design system reference](../design/DESIGN_SYSTEM.md)
- [Redesign workflow](../design/REDESIGN_WORKFLOW.md)

## Working state

- [Current task and Git checkpoint](../../.scratch/NOW.md)
- [Agent operating rules](../../AGENTS.md)
- Reusable procedures live in `.agents/skills/`.
- Current runtime behavior is verified in source code and tests.

## Placement rules

- Keep durable facts in their existing canonical files under `docs/`; do not mirror them into a second `knowledge/` tree.
- Record material decisions in `DECISIONS.md` following its accepted status and approval rules.
- Keep only current work and checkpoint state in `.scratch/NOW.md`; link to specs or decisions for history.
- Treat `.obsidian/` as local vault configuration, not project knowledge.
