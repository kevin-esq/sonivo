# Phase 1 — Hygiene and documentation

**Status:** PROPOSED. **Goal:** reduce documentation drift and improve navigation without changing runtime behavior.

**Scope:** reconcile durable status; audit canonical duplicates; translate verified non-English engineering documentation in reviewed batches; add a lightweight language regression check; reorganize architecture documents only after link and ownership mapping; add contributor/agent guidance only where a real gap exists.

**Out of scope:** code or route changes; changing product requirements; deleting historical legal/security evidence; moving `DECISIONS.md` before owner approves a migration approach; broad automated translation.

**Exit criteria:** `CONTEXT.md` agrees with closed-phase evidence; all links resolve; every doc has one declared owner/status; translation batches preserve meaning, links, technical terms, and user-facing locale text; the language check has documented false-positive limits; root onboarding points to canonical docs.

**Tickets:** T-101 through T-108. T-101 precedes canonical-source resolution; language batches can run independently after audit; taxonomy and contributor guidance require owner approval. T-108 removes tracked screenshot assets from the index in a separate, reversible PR after confirming local retention.
