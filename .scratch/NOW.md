# NOW — agent focus

**Updated:** 2026-09-28

## Checkpoint state

```text
Implementation: IN PROGRESS (UI/UX redesign: W0-W4 MERGED PRs #115-#119; W5 integrated — full frontend i18n, a11y, plus owner's structural hardening kept per explicit decision; 46/46 local E2E green)
Human approval: APPROVED (explicit full-flow order: delegate to agents, audit per wave, push + merge when green, delete branches, continue to completion; plus explicit "es mío, consérvalo e intégralo" for the parallel hardening)
Git checkpoint: PENDING (W5 commit + PR + merge on green)
Remote: NOT PUSHED (W5)
CI: NOT RUN (W5; local: build + oxlint clean, E2E 46/46)
```

## Current state

- **UI/UX redesign (ADR-0043, ACCEPTED 2026-09-29; SHIPPED 2026-09-30):** waves W0–W4 merged (#115–#119). **W5** = full frontend es/en i18n sweep + a11y/hygiene + integrated structural hardening (route code-splitting, error boundary, `/login?next=` via `safeNextPath`, authenticated-player gating) + [`PHASE-UI-UX-SPEC.md`](../docs/03-architecture/PHASE-UI-UX-SPEC.md). Auditor fixes in W5: `AuthenticatedPlayer` used a non-existent `stop()` → real `closeTrack()`; resend-confirmation copy restored so `auth.spec.ts` contract holds. Local E2E **46/46**.
- **W5 known limitation (explicit):** Practice's default Estudiar tab keeps conductor+tuner visible because `TC-Q9-01`/`TC-PITCH-01` assert them; Avanzado/Afinar give progressive access. Slimming the default would require changing those specs' contract — deliberately not done.
- **Passkeys E2E CI fix:** `e2e/tests/passkeys.spec.ts` attaches a CDP virtual authenticator, and `.github/workflows/ci.yml` browses via `http://localhost:5173` instead of `127.0.0.1`. Root cause: commit `51bcb9e` wired real `navigator.credentials.create()`; headless Chromium throws `SecurityError` on IP-literal origins.
- Prior ADR-0041 work: `.cursor/`, `.codex/`, and `.claude/` customizations were removed by explicit user authorization.
- The worktree already had changes in `docs/00-context/GLOSSARY.md`, API/spec docs, local vault files, and the original ZIP; preserve them.
- Root `.obsidian/` is local configuration and was not modified.

## Next authorized work

T-R2-04 PR #95 is MERGED (d7e3340, 2026-09-27) and post-hoc subset verification is COMPLETE 2026-09-29: 4 live keys, 2/2 present in R2, 2/2 missing bytes explained (never backfilled; parents soft-deleted by Owner 2026-09-21; remedy DECLINED by Owner 2026-09-29 (test files only, dead rows stay as orphans). UI shell slice (R1–R4) MERGED (PR #109). See [`PHASE-R2-SPEC.md`](../docs/03-architecture/PHASE-R2-SPEC.md).

Completed wave history belongs in ADRs, phase specs, commits, and PRs rather than this current-state note.
