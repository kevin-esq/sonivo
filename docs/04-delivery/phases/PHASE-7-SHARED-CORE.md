# Phase 7 — Shared playback and realtime

**Status:** PROPOSED / FUTURE. **Goal:** determine whether playback code has a real second consumer and document the existing realtime contract before expansion.

**Scope:** measure Stage mode requirements; identify UI-free playback boundaries; inventory existing hub methods/events; decide snapshot/reconnect/version needs only for an approved product use case.

**Out of scope:** desktop product code, event sourcing, durable event bus, audio caching, MIDI, karaoke/DJ controls, or changing ADR-0036 without a superseding decision.

**Exit criteria:** either evidence supports a small shared package and owner approves extraction, or a no-extraction decision is recorded; any realtime changes have a bounded protocol, compatibility matrix, and tests.

**Tickets:** T-701 and T-702 are discovery-only. Protocol implementation is blocked on an accepted ADR and is not pre-authorized here.
