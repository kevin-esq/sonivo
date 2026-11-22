# Delivery planning

This folder contains the proposed, owner-reviewable delivery plan for repository hygiene, contracts, operations, deployment, web, shared playback, backend structure, and native clients.

## Status and authority

- Ticket status `Backlog` means proposed work, not authorized implementation.
- `PROPOSED` drafts are not accepted architecture decisions. Only **ACCEPTED** entries in [`../03-architecture/DECISIONS.md`](../03-architecture/DECISIONS.md) bind implementation.
- Existing source, tests, `CONTEXT.md`, accepted ADRs, then delivery proposals form the review order. This plan does not amend accepted decisions or reopen closed phases.
- Every implementation ticket needs its own owner approval and Git authorization under `AGENTS.md`.

## How to use

1. Read [`RECOMMENDATIONS-VERIFICATION.md`](RECOMMENDATIONS-VERIFICATION.md) before selecting work.
2. Read [`MASTER-PLAN.md`](MASTER-PLAN.md), then the relevant phase and ticket.
3. Start only a ticket whose dependencies are complete and whose owner decision gates are resolved.
4. Update [`BOARD.md`](BOARD.md) and `.scratch/NOW.md` only when operational status changes.

Phase and ticket documents use English. Product UI text and user-generated fixtures remain in their existing languages.

## Validation command reference

Run only commands relevant to a ticket, and report unmet infrastructure rather than claiming a pass:

- Documentation-only: `git diff --check` must exit 0; every changed relative Markdown link must resolve. No repository-wide link-check command was found during this review.
- .NET API/backend: `dotnet build Sonivo.slnx` and `dotnet test Sonivo.slnx` must exit 0. Integration tests require PostgreSQL as described in `README.md` and `docs/03-architecture/TESTING.md`.
- Web: from `web/`, run `npm run build`; it must exit 0. Playwright journeys require the configured API/database and run from `e2e/` with `npm test -- tests/<feature>.spec.ts`.
- Android: from `mobile/android/`, run `./gradlew test` (Windows: `./gradlew.bat test`); it must exit 0.
- iOS: on macOS, run `xcodebuild -list -project mobile/ios/Sonivo.xcodeproj`, then run tests with the listed scheme. Linux/Windows cannot verify the Xcode build.

Each ticket’s own focused tests remain mandatory even when these broad commands pass.

## ADR proposal placement

The repository's [`decision-record` procedure](../../.agents/skills/decision-record/SKILL.md) and [`DECISIONS.md`](../03-architecture/DECISIONS.md) define one canonical ADR ledger. To avoid creating a competing `docs/03-architecture/adr/` source, requested decision drafts live under [`adr-proposals/`](adr-proposals/). They are planning artifacts only; an owner-approved decision must later be entered in `DECISIONS.md` using the repository's numbering and status rules.
