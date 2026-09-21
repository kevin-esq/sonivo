# Phase LLM cloud upgrade of P1/P2 (ADR-0033)

**Status:** **CLOSED** 2026-09-20 — Wave B closed under Option C (no cloud vendor; HUMAN-DELEGATED, see ADR-0033 Resolution). Deterministic P1/P2 per ADR-0030 unchanged. The Q-LLM table below is retained as the question set for any future reopen. No implementation was authorized and none shipped.
**Product bet (not pursued):** Owner-invoked cloud draft (“Generar con IA”) improves P1 chord placement and P2 song seeding — deterministic engines stay as offline fallback, Owner review-and-save required.
**Date:** 2026-09-20
**Depends on:** ADR-0033 (SUPERSEDED by Wave B closure), 0019, 0020, 0025, 0027, 0028, 0030 (P1/P2 deterministic baseline); [`PHASE-CHORDPRO-IA-SPEC.md`](PHASE-CHORDPRO-IA-SPEC.md).

---

## Mechanics (proposed — binding only after ACCEPTANCE)

| ID | Sketch (open items are questions for Kevin, not decisions) |
| -- | ----------------------------------------------------------- |
| Q-LLM-1 | P1 upgrade: lyrics + chord list → LLM-proposed ChordPro placement; output lands in the existing nudge studio as an editable draft. Deterministic placer stays as fallback. |
| Q-LLM-2 | P2 upgrade: brief (género, tonalidad, idea) → LLM-proposed structured ChordPro (`{start_of_verse}` / `{start_of_chorus}`); “variar progresión” / “reescribir sección” may re-call the LLM. Templates/rules stay as fallback. |
| Q-LLM-3 | Draft-only: LLM output persists only via explicit Owner save through the existing PATCH `chords` path (`expectedVersion` / 409 per ADR-0025). No auto-save, no background generation. |
| Q-LLM-4 | Provider + secrets (L33-Q1/Q2): which vendor, config key names, per-env provisioning, rotation. Never in git/DB (proposed). |
| Q-LLM-5 | Cost caps / rate limits (L33-Q3): per-call token ceiling, per-group quota, over-quota behavior. |
| Q-LLM-6 | Privacy (L33-Q4): retention policy, DPA/terms, user notice/consent copy for content sent to the vendor. |
| Q-LLM-7 | Fallback (L33-Q5): exact UX when the vendor is unreachable/unconfigured — hide vs degrade-to-deterministic + Spanish notice copy. |
| Q-LLM-8 | Roles (L33-Q6): Owner-only generation (default) vs Member-invoked drafts. Saved `Chords` consumption unchanged (Owner + Member read). |
| Q-LLM-9 | Testability: LLM behind an `ILyricChordAssistant`-style interface (name TBD at ACCEPTANCE); unit/API tests run against a fake (no vendor calls in tests). E2E asserts mechanics (generate → review renders → apply → Practice shows chords), not model quality. |
| Q-LLM-10 | Spanish UI (“Generar con IA”, “Revisar borrador”, “Aplicar”, “Descartar”). |
| Q-LLM-11 | **OUT (firewall):** Whisper changes (Wave A done), unattended ML auto-marks (Wave C), Q9 realtime, pitch, YouTube, S3, raising 5 MiB, MusicXML / Guitar Pro, Event/RSVP mail. |

---

## Scope

| In (thin, after ACCEPTANCE) | Out |
| --------------------------- | --- |
| Server LLM draft endpoints + caps + fake-backed tests (T-LLM-01) | New persistence tables / migrations |
| Owner review-and-save UX incl. deterministic fallback notice (T-LLM-02, Spanish) | Auto-save / unattended marks (Wave C) |
| Unit + API tests with fake assistant; sparse Playwright TC-LLM-01 (T-LLM-03) | Whisper / audio changes (Wave A done) |
| One pinned vendor SDK/HTTPS client, justified by ACCEPTED ADR | Q9 realtime, pitch, YouTube, S3, 5 MiB raise, MusicXML |

---

## Tickets (CLOSED with the spec — Wave B closed under Option C, no implementation was authorized)

| ID | Work | Status |
| -- | ---- | ------ |
| **T-LLM-00** | Docs: ADR-0033 PROPOSED + this spec skeleton + NOW update | MERGED (PR #85) → CLOSED Option C, ADR-0033 SUPERSEDED |
| **T-LLM-01** | Server: LLM assistant interface + draft endpoints + caps/quotas + unit/API tests with fake | CLOSED unstarted (Option C) |
| **T-LLM-02** | Web: Owner generate/review UX (draft, apply via PATCH, deterministic fallback, discard; Spanish) | CLOSED unstarted (Option C) |
| **T-LLM-03** | Tests: TC-LLM-01 Playwright (mechanics assertions) + suite green | CLOSED unstarted (Option C) |

Implementation branch naming: `feature/t-llm-*` (one coherent vertical slice per ticket or batched only with explicit approval).

---

## API / persistence notes (proposed, binding only after ACCEPTANCE)

- No migration in thin: reuse `Arrangement.Chords` (text) column; drafts are ephemeral until Owner saves.
- Any draft-ephemeral state (server or client) must be justified in T-LLM-01/02 tickets; drafts MUST NOT become a shadow second body of record.
- AuthZ: Owner generate by default (same `RequireOwnerAsync` pattern; per-request group+arrangement check → 404 non-member/unknown, 403 member non-Owner) unless L33-Q6 decides otherwise. CSRF per ADR-0020 on mutating calls.
- Concurrency: existing integer `Version` / 409 unchanged; draft save is a normal PATCH.
- No new dependencies beyond what ACCEPTED ADR-0033 authorizes; no secrets in git.

---

## Audit checklist (each implementation PR, after ACCEPTANCE)

- [ ] No Whisper changes / unattended ML auto-marks / Q9 / pitch / YouTube / S3 / 5 MiB raise
- [ ] No new persistence tables (existing `Chords` only)
- [ ] Deterministic P1/P2 engines intact as offline fallback
- [ ] Owner review-and-save required before any LLM output persists
- [ ] Spanish copy
- [ ] Named Playwright TC when T-LLM-03 ships + suite green
- [ ] No Cursor co-author trailers
