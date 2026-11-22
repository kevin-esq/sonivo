# Phase 4 — Data and environments

**Status:** PROPOSED. **Goal:** make connection roles, migration ordering, previews, backups, and restore behavior reproducible.

**Scope:** verify pooled runtime/direct privileged migration roles; preserve transaction-local RLS context; document environment/secrets ownership; automate migration gates only after owner approval; rehearse recovery and branch cleanup.

**Out of scope:** changing production credentials or databases; applying migrations; changing RLS policies; unapproved backup retention or paid Neon plan changes.

**Exit criteria:** runtime never uses migration privilege; pooler tests prove tenant scope does not leak; CI/deploy migration order has an explicit gate; backup/PITR window and restore evidence are approved and recorded; preview branches have bounded lifetime/cost.

**Tickets:** T-401 to T-404. RLS tests may proceed independently; production automation and preview branches require owner/provider approval.
