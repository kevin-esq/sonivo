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
| **T-R2-01** | Server: `R2BlobStore:IBlobStore` + conditional registration + config + unit tests (fake-backed) | MERGED (PR #92) |
| **T-R2-02** | Migration: dual-read R2-first + lazy backfill; `ResourceBlobs` retained (NEVER dropped in this slice) | MERGED (PR #92); table drop scheduled for a later migration after verified backfill |
| **T-R2-03** | Tests: API AuthZ matrix (existing TC-LIB-04 covers the path) + full-suite green WITH R2 configured locally + document CI Postgres-path coverage | DONE — no new TC (verdict in spec); full E2E 31/31 green on the R2 path; CI Postgres path unchanged; PROD LIVE with R2 backend (log-verified 2026-09-21) |

Implementation branch naming: `feature/t-r2-*` (one coherent vertical slice per ticket or batched only with explicit approval).

---

## API / persistence notes (binding — frozen 2026-09-21)

- No `Resource` model change; `Resource` rows/metadata stay in Postgres always.
- `ResourceBlobs` table survives the thin cutover; its drop ships only in a later migration after verified backfill.
- AuthZ: existing Membership recheck on `GET .../content` unchanged (404 non-member/unknown, 403 member non-Owner where Owner-only). CSRF per ADR-0020 on mutating calls.
- Concurrency/versioning: unchanged (integer `Version` / 409 per ADR-0025 where applicable).
- No new dependencies beyond what ACCEPTED ADR-0035 authorizes; no secrets in git.

---

## Audit checklist (R2 implementation — verified 2026-09-21)

- [x] No AuthZ/tenancy/soft-delete semantic changes
- [x] No public buckets / bare presigned reads / browser-direct PUT
- [x] 5 MiB cap unchanged
- [x] `ResourceBlobs` retained (NEVER dropped in this slice)
- [x] No secrets in git; per-env config only
- [x] Spanish error copy (no user-facing copy change; ops-only thin)
- [x] E2E verdict recorded (T-R2-03 outcome below) + suite green
- [x] No Cursor co-author trailers

## T-R2-03 outcome (2026-09-21, branch `feature/t-r2-blobstore`)

- **TC-R2-01 explicitly NOT added.** No backend-observable behavior exists at the
  E2E level without leaking infra details: the upload/download path through
  `IBlobStore` + AuthZ'd `GET .../content` is identical on either backend, and
  backend choice is an ops concern (asserted at startup log + unit/integration level).
  A product E2E asserting "served from R2" would couple journeys to infrastructure.
- **CI Postgres-path coverage (unchanged default):** CI has no `R2__*` creds, so
  `R2Options.IsConfigured` is false and `PostgresBlobStore` stays the `IBlobStore`.
  `FileResourceApiTests` (upload → member download → AuthZ 404/403 matrix →
  `ResourceBlobs` row asserts) covers this path; full `dotnet test Sonivo.slnx`
  green 402/402 (Domain 80 + Application 176 + Integration 44 + Api 102).
- **Local R2-path coverage (this machine, user env):** `R2LiveMigrationTests`
  executed live against bucket `sonivo-blobs` (put/get/delete roundtrip +
  dual-read backfill keeping the Postgres row, ~2s each; unique `test/` keys,
  cleaned up). Full Playwright suite **31/31 green WITH R2 configured**
  (API log: `Blob storage backend: R2`; TC-LIB-04 exercised live R2 PUT + GET).
  First attempt showed 21 pass / 10 fail from a dead local Vite server only;
  re-run of the 5 affected files after restart: 11/11 pass — no product regression.
- **2026-09-22 update (T-R2-04 + dev bucket):** the Postgres/DualRead machinery above is REMOVED (migration `DropResourceBlobs`; `FileSystemBlobStore` is the unconfigured default). Local runs now target bucket **`sonivo-blobs-dev`** (automatic jurisdiction, created 2026-09-22) via user-env `R2__BucketName` so E2E/test uploads stop polluting the prod bucket; the prod bucket stays canonical for prod only. Backfill gate (R2 objects vs Postgres rows) still governs the T-R2-04 merge.
