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
- [Tooling policy](../tooling/TOOLING-AUDIT.md)

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
