# Phase 8 — Backend and E2E structure

**Status:** PROPOSED. **Goal:** improve capability ownership and enforce existing architecture with small, behavior-neutral steps.

**Scope:** move lifecycle classes from Payments namespace after tests; evaluate SDK/package pinning; extend existing architecture tests only for uncovered rules; rename E2E specs in small batches with all references updated; assess ChordPro extraction only if reuse appears.

**Out of scope:** new projects/layers without consumers; mass folder moves; replacing existing architecture tests with a package by default; behavior or persistence changes.

**Exit criteria:** each move has unchanged behavior and passing tests; dependency direction is executable in tests; naming remains searchable; any package addition has current license/version/maintenance evidence and owner approval.

**Tickets:** T-801 to T-804. ChordPro project extraction is omitted unless a second consumer is demonstrated.
