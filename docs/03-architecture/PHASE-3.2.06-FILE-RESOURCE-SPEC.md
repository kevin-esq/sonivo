# Phase T-3.2.06 — Thin File Resource / blob / content

**Status:** IMPLEMENTATION COMPLETE (feature branch / PR → `develop`; auditor merge). Authorized 2026-09-17 (Kevin Esquivel — “Acepto todo”).  
**Product bet:** Link Resources are not enough for rehearsal — Owners must attach a small file (chart PDF, lyric sheet, click track) and Members must open/download it through Sonivo AuthZ.  
**Date:** 2026-09-17  
**Depends on:** ADR-0007–0008, 0014, 0017, 0020, 0023–0025; Phase 3.2 link Resource slice **COMPLETE**.

Accepted ADRs remain authoritative. This spec **un-defers** T-3.2.06 only. It does **not** reopen ADRs. It does **not** add S3, Google OAuth, karaoke, or Event Resource snapshots.

---

## Product Goal

Close the material gap in **prepare the next musical event**: Arrangement Resources may be **file** as well as **link**. Upload once; every Member downloads the same bytes via authorized `content`.

---

## Frozen mechanics (thin defaults)

| ID | Decision for thin T-3.2.06 |
| -- | ------------------------- |
| Q-R1 | **`IBlobStore` + Postgres bytea** (`ResourceBlobs` table keyed by `ObjectKey`). No S3/R2/Azure in this slice. Works on Neon + Render Free without new vendors. FUTURE object storage may supersede via new adapter only. |
| Q-R2 | **Max 5 MiB** per file. MIME allowlist: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`, `audio/mpeg`, `audio/wav`, `audio/mp4`, `text/plain`. Reject others with **400**. |
| Q-F1 | Create via **`multipart/form-data`** on nested Resource collection (fields: `purpose`, `label`, optional `part`/`note`, `file`). Not JSON base64. |
| Q-F2 | **`GET .../resources/{resourceId}/content`** streams bytes; `Content-Type` from stored; `Content-Disposition: attachment` with original file name (sanitized). AuthZ **Member**. |
| Q-F3 | Link create path **unchanged** (JSON `kind=link`). File create is a **separate** POST content-type path (or same route branching on `multipart`). Prefer **same route**: if `Content-Type` is multipart → file; if JSON → link (existing). |
| Q-F4 | File Resources: `Url` is **null**; `ObjectKey`, `ContentType`, `ByteSize`, `OriginalFileName` required. |
| Q-F5 | PATCH metadata (purpose/label/part/note) allowed for **both** link and file. `kind`, `url`, blob fields immutable. |
| Q-F6 | Hard-delete Resource deletes DB row **and** best-effort blob row. Failure to delete blob after row delete is logged; no orphan UI. |
| Q-F7 | Soft-delete Arrangement: leave Resource rows/blobs (ADR-0017/0023). No purge job. |
| Q-F8 | CSRF on multipart POST/PATCH/DELETE (ADR-0020). Cookie auth unchanged. |
| Q-F9 | UI Spanish: “Subir archivo”, “Descargar”, no Spanglish. |
| Q-F10 | No virus scan, no image resize, no streaming transcoder, no chunked upload resume. |

This freeze is a **thin product default**, not a new ADR (Kind `file` already in ADR-0014/0017).

---

## Scope

| Area | In |
| ---- | -- |
| Domain | `Resource.CreateFile(...)`; allow metadata update for file Kind; remove “reject file” gate |
| Port | `IBlobStore` (`PutAsync`, `GetAsync`, `DeleteAsync`) |
| Infra | `PostgresBlobStore` + EF entity/table `ResourceBlobs` (ObjectKey PK, Bytes, ContentType, ByteSize, CreatedAt) |
| API | Multipart create file; GET content stream; list/get include `kind` + file metadata (no bytes); PATCH metadata; DELETE + blob |
| UI | Arrangement detail: Owner upload form; Member/Owner download link/button for file rows |
| Tests | Application/API/Integration for create/get content/delete + AuthZ; Playwright **TC-LIB-04** Owner upload small PDF/text → Member (or same Owner) can download |

---

## Explicit Non-Scope

S3/R2/MinIO · local FS blob provider · virus scan · >5 MiB · arbitrary MIME · replace-in-place blob · Event Resource snapshots · Google OAuth · karaoke · ChordPro · T-OPS beyond deploy of this slice · Spanglish labels

---

## API (delta)

All under `/api/groups/{groupId}/arrangements/{arrangementId}`. Cookie session. Problem Details. JSON camelCase for JSON bodies.

| Method | Route | AuthZ | Body | Success | Failures |
| ------ | ----- | ----- | ---- | ------- | -------- |
| POST | `.../resources` | Owner | **multipart**: purpose, label, part?, note?, file | 201 Resource summary (`kind=file`) | 401, 403, 404, 400 |
| POST | `.../resources` | Owner | **JSON** link (existing) | 201 (unchanged) | unchanged |
| GET | `.../resources/{resourceId}/content` | Member | — | 200 octet stream | 401, 404; 400 if kind≠file |
| GET | `.../resources` / `{id}` | Member | — | Include `kind`, file metadata fields; **never** bytes | unchanged + fields |
| PATCH | `.../resources/{resourceId}` | Owner | purpose/label/part/note | 200 | allow file Kind |
| DELETE | `.../resources/{resourceId}` | Owner | — | 204 + blob delete | 401, 403, 404 |

Rules:

- Missing file / empty / oversize / bad MIME → **400**.
- Non-member → **404** (do not leak). Anon → **401**.
- Content for link Resource → **400**.

---

## Tickets

| ID | Work |
| -- | ---- |
| T-3.2.06.01 | Domain + `IBlobStore` + Postgres store + migration + Application handlers + API (multipart + content) + unit/integration tests |
| T-3.2.06.02 | React Arrangement UI upload + download (Spanish copy) |
| T-3.2.06.03 | Playwright TC-LIB-04 (upload + download assertion) |

Ship as **one PR** on `feature/t-3.2.06-file-resource` → `develop` when all three green locally.

---

## Docs to sync (same PR or docs follow-up in PR)

- [`PHASE-3.2-REPERTOIRE-SPEC.md`](PHASE-3.2-REPERTOIRE-SPEC.md) — mark T-3.2.06 COMPLETE when merged  
- [`API.md`](API.md) — file create + content  
- [`AGENTS.md`](../../AGENTS.md) / [`CONTEXT.md`](../00-context/CONTEXT.md) — un-defer T-3.2.06 after merge  

---

## Audit checklist (auditor)

- [ ] No S3 / new cloud blob vendor  
- [ ] Max 5 MiB + MIME allowlist enforced server-side  
- [ ] Member can GET content; non-member 404  
- [ ] Link path regression: existing TC-LIB-01 still passes  
- [ ] Hard-delete removes blob  
- [ ] Spanish UI labels; no Cursor trailers  
- [ ] Full Playwright 15+ (incl. TC-LIB-04) green before merge  
