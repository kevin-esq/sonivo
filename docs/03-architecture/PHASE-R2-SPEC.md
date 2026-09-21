# Phase R2 blob backend thin (ADR-0035)

**Status:** **ACCEPTED / FROZEN 2026-09-21** — ADR-0035 HUMAN-DELEGATED ACCEPTED (R2-Q1–Q7 resolved in the ADR). Tickets T-R2-01–03 active on `feature/t-r2-blobstore`.
**Product bet:** Arrangement file bytes live in Cloudflare R2 (S3-compatible) behind the existing `IBlobStore` abstraction — same Resource model, same AuthZ'd `GET .../content` proxy, Postgres as default/fallback + metadata store.
**Date:** 2026-09-20
**Depends on:** ADR-0035 (ACCEPTED 2026-09-21), 0010, 0019, 0020, 0023; T-3.2.06 ([`PHASE-3.2.06-FILE-RESOURCE-SPEC.md`](PHASE-3.2.06-FILE-RESOURCE-SPEC.md)).

**Decided facts (from ADR-0035 resolution, binding):** bucket `sonivo-blobs`, automatic jurisdiction, scoped Object Read & Write token on that bucket ONLY, user-env config `R2__AccountId` / `R2__AccessKey` / `R2__Secret` / `R2__BucketName` (local: this machine's user environment; Render env is Kevin's later ops step), free-tier-only with no quota enforcement in code (documented), orphans stay (same as Postgres, no lifecycle rule), proxy-only (no public buckets / presigned reads / CORS), 5 MiB cap UNCHANGED, `ResourceBlobs` table NEVER dropped in this slice.

---

## Mechanics (binding — frozen 2026-09-21)

| ID | Sketch |
| -- | ------ |
| Q-R2-1 | New `R2BlobStore : IBlobStore` in Infrastructure (S3-compatible via `AWSSDK.S3`); conditional registration — R2 configured → R2, else Postgres. `IBlobStore` contract unchanged. |
| Q-R2-2 | S3 client shape (per the documented R2 dotnet example — re-verify at implementation): `ServiceURL https://<ACCOUNT>.r2.cloudflarestorage.com`, region `auto`, `DisablePayloadSigning` + `DisableDefaultChecksumValidation`. R2-Q2 (bucket name + jurisdiction) open. |
| Q-R2-3 | Config keys (proposed): `R2:AccountId` / `R2:AccessKey` / `R2:Secret` / `R2:BucketName` — per-env, never in git/DB. Provisioning + rotation per R2-Q3. |
| Q-R2-4 | Read path unchanged: AuthZ'd `GET .../content` server proxy with per-request Membership recheck (404/403 per ADR-0019). No public buckets, no bare presigned reads, no browser-direct PUT (R2-Q4; no CORS surface). |
| Q-R2-5 | Write/delete path: server-side Put/Delete/Head through `R2BlobStore` after the existing Owner AuthZ checks; 5 MiB cap UNCHANGED (no raise in thin). |
| Q-R2-6 | Migration (proposed): dual-read R2-first + Postgres fallback; lazy backfill of `ResourceBlobs` rows into R2 on read. `Resource` rows/metadata stay in Postgres. Drop `ResourceBlobs` only in a later migration after verified backfill — never in the thin cutover. |
| Q-R2-7 | Orphan-blob lifecycle: ADR-0023 leaves rows/blobs in place on Arrangement soft-delete — confirm the same for R2 objects (purge stays FUTURE) or define the R2 variant (R2-Q5). |
| Q-R2-8 | Cost/ops: free-tier headroom + overage acceptance + alerting per R2-Q6; card-on-file per R2-Q7. |
| Q-R2-9 | Testability: `IBlobStore` behind the existing seam; unit/API tests run against a fake/in-memory store (no R2 calls in tests). E2E asserts mechanics (upload → content → AuthZ 404/403 matrix), not vendor behavior. |
| Q-R2-10 | Spanish UI: no user-visible copy change expected (ops-only); error copy stays Spanish. |
| Q-R2-11 | **OUT (firewall):** AuthZ/tenancy changes, soft-delete semantic changes, public buckets / bare presigned URLs, browser-direct PUT / CORS, 5 MiB raise, Whisper, cloud LLM, unattended ML auto-marks, Q9, pitch, YouTube, MusicXML, Event/RSVP mail. |

---

## Scope

| In (thin, after ACCEPTANCE) | Out |
| --------------------------- | --- |
| `R2BlobStore` + conditional registration + config (T-R2-01) | New Resource model fields / route shape changes |
| Dual-read + lazy backfill migration path (T-R2-02) | Dropping `ResourceBlobs` before verified backfill |
| Unit + API tests with fake store; sparse Playwright content/AuthZ mechanics (T-R2-03) | Public buckets / presigned reads / browser-direct PUT |
| Pinned `AWSSDK.S3`, justified by ACCEPTED ADR-0035 | 5 MiB raise, Q9, pitch, YouTube, Whisper, cloud LLM |

---

## Tickets (active — branch `feature/t-r2-blobstore`)

| ID | Work | Status |
| -- | ---- | ------ |
| **T-R2-00** | Docs: ADR-0035 PROPOSED + this spec skeleton + NOW update | DONE (PROPOSED docs merged PR #87; ACCEPTED 2026-09-21 HUMAN-DELEGATED) |
| **T-R2-01** | Server: `R2BlobStore:IBlobStore` + conditional registration + config + unit tests (fake-backed) | ACTIVE |
| **T-R2-02** | Migration: dual-read R2-first + lazy backfill; `ResourceBlobs` retained (NEVER dropped in this slice) | ACTIVE |
| **T-R2-03** | Tests: API AuthZ matrix (existing TC-LIB-04 covers the path) + full-suite green WITH R2 configured locally + document CI Postgres-path coverage | ACTIVE |

Implementation branch naming: `feature/t-r2-*` (one coherent vertical slice per ticket or batched only with explicit approval).

---

## API / persistence notes (binding — frozen 2026-09-21)

- No `Resource` model change; `Resource` rows/metadata stay in Postgres always.
- `ResourceBlobs` table survives the thin cutover; its drop ships only in a later migration after verified backfill.
- AuthZ: existing Membership recheck on `GET .../content` unchanged (404 non-member/unknown, 403 member non-Owner where Owner-only). CSRF per ADR-0020 on mutating calls.
- Concurrency/versioning: unchanged (integer `Version` / 409 per ADR-0025 where applicable).
- No new dependencies beyond what ACCEPTED ADR-0035 authorizes; no secrets in git.

---

## Audit checklist (each implementation PR, after ACCEPTANCE)

- [ ] No AuthZ/tenancy/soft-delete semantic changes
- [ ] No public buckets / bare presigned reads / browser-direct PUT
- [ ] 5 MiB cap unchanged
- [ ] `ResourceBlobs` retained until verified-backfill migration
- [ ] No secrets in git; per-env config only
- [ ] Spanish error copy
- [ ] Named Playwright TC when T-R2-03 ships + suite green
- [ ] No Cursor co-author trailers
