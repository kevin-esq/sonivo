# PHASE-4.1 — Hierarchical repertoire access controls

**Status:** ACCEPTED — user-authorized 2026-10-17; [ADR-0085](DECISIONS.md)
amends the resource-kind scope in ADR-0082.
**Delivery:** Ticketed security slice. The scope is limited to Song →
Arrangement → Arrangement Resource.

## Goal

Let an Owner narrow an individual member's read visibility at song,
arrangement, and resource level while preserving understandable inheritance,
server-enforced authorization, and safe group isolation.

## Required behavior

1. For each request, verify membership in the selected Group, load each target
   through that Group's scoped store, and evaluate Song → Arrangement →
   Resource from parent to child.
2. Parent denial or lack of read access blocks every descendant. A child allow
   never widens an inaccessible parent. A child deny narrows access inherited
   from a readable parent.
3. Item allows can grant read only. Writes require the existing group role
   capability and no denied item on the ancestor path.
4. Apply checks to song/arrangement/resource lists, detail DTOs, arrangement
   nested resource summaries, create/edit/delete, file content/download,
   digitization request/result paths, and any realtime surface that exposes the
   affected data. Record any non-applicable surface with its route evidence.
5. The grant API accepts only the three ADR-0085 kinds and validates target and
   ancestry in the chosen Group. It rejects missing/cross-Group targets and the
   Owner target. Audit each changed grant with actor, target, kind, ID, and
   resulting state.
6. Owner UI supports inherit/visible/restricted per node, communicates that
   parent restrictions take precedence, uses progressive disclosure, and is
   localized in es/en/pt. A child exception is visibly marked as ineffective
   while an ancestor is restricted.

## Tickets and acceptance gates

### T-4.1.01 — Grant model and administration boundary

- Extend accepted override kinds to song, arrangement, and resource.
- Validate targets and ancestry with Group-scoped stores before change.
- Test owner denial, nonmember target, cross-Group/missing targets, normalization,
  audit metadata, and allow/remove idempotence.

### T-4.1.02 — Read path inheritance and list filtering

- Enforce parent-to-child read decisions in every list, detail, and nested DTO.
- Verify grants cannot bypass a denied parent and child denies remove visibility.
- Test group-wide and explicit-parent-allow list behavior.

### T-4.1.03 — Write and file boundaries

- Apply role write permissions and every ancestor deny to arrangement/resource
  mutations, upload, file content/download, and digitization.
- Test that item allows never add writes; each ancestor deny blocks writes and
  file bytes.

### T-4.1.04 — Owner control UI and help

- Replace song-only controls with a simple hierarchy and advanced per-item
  disclosure for arrangements/resources.
- Add localized copy, searchable hierarchy, inherited/override status, failure
  recovery, keyboard semantics, responsive behavior, and Help content.
- Do not render unsaved or failed requests as authoritative state.

### T-4.1.05 — Real-stack verification

- Add critical Playwright journeys for inherited read, arrangement deny,
  resource deny/download, child allow blocked by parent, and Owner management.
- Validate keyboard access and mobile layout in the visible Playwright MCP;
  run focused API, tenancy architecture, frontend checks, and full API suite.
- Report each result exactly. Do not commit or push without a separate Git
  checkpoint authorization.

## Exclusions

No item ACLs for Events, Setlists, or future resource kinds; no write grants,
generic policy engine, PostgreSQL RLS, ambient tenant context, new plan gating,
or cross-Group reporting.
