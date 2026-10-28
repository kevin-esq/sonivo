# Sonivo interface redesign workflow

Use this workflow for a requested screen redesign. Product truth, accepted ADRs, security boundaries, and current user authorization remain binding.

1. **Read context:** check `AGENTS.md`, `CONTEXT.md`, the knowledge index, applicable product/domain docs, accepted ADRs, active ticket/spec, and the relevant frontend/testing guidance.
2. **Trace the task:** inspect the route, source components, API contracts, translations, tests, and staging/local behavior when available. Record exact steps and distinguish **Observed**, **Inferred**, and **Proposed** findings.
3. **Set the experience:** identify the user goal, primary action, secondary/advanced needs, current state model, recovery path, responsive behavior, and accessibility risks. Preserve product functions and data contracts unless authorized evidence supports a change.
4. **Choose a direction:** present up to three materially different directions only when that comparison helps a decision. Preserve Sonivo's visual identity. Use Penpot only after its MCP connection is configured and verified; never treat a concept as implemented UI.
5. **Prototype safely:** build functional explorations in Storybook using existing components and mock data. Keep Storybook on its local loopback server; do not add an unprotected production route. Do not replace the product screen until a direction is selected where the request requires selection.
6. **Implement incrementally:** follow frontend architecture, i18n, security, validation, testing, and accepted ADRs. Do not add dependencies or alter business/API contracts without authorization and required decisions.
7. **Validate:** run the relevant unit/component and type checks, critical Playwright user journeys, a11y checks, and manual desktop/mobile review. Verify loading, empty, error, success, permissions, cancel/return, and direct-link behavior where applicable. Report exact commands and results; distinguish unavailable tests from passing tests.
8. **Review and report:** compare behavior against the original task and acceptance criteria, document any ADR/documentation impact, report Git state, and wait for human review before Git checkpoint actions.

## Storybook conventions

- Stories belong beside real reusable UI components under `web/apps/app/src/` and use Spanish copy consistent with the app's default locale.
- Include controls for meaningful public props and stories for supported interaction states. Keep mock data deterministic and avoid real user/group data.
- Load the app's global stylesheet and language context through `.storybook/preview.tsx`.
- Run with `npm run storybook --workspace=@sonivo/app`; build with `npm run build-storybook --workspace=@sonivo/app`.
- Stories and Storybook static output are design-time artifacts, not routes or assets shipped with the application.

## Penpot MCP status

The repository does not store the owner's Penpot token. Configure the official remote endpoint only in the intended personal Codex configuration through a secure flow; do not commit credentials or paste them into source or project MCP config. Mark the connection verified only after Codex discovers and successfully invokes a real read-only Penpot tool. The user must open the target Penpot file and connect it to MCP before file-specific inspection is possible.
