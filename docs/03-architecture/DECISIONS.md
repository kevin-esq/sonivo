# DECISIONS.md — Sonivo

Architecture Decision Records.

**Statuses:** `PROPOSED` | `ACCEPTED` | `SUPERSEDED`

Only **ACCEPTED** ADRs bind implementation. Newest first.

---

## ADR-0035 — Cloudflare R2 (S3-compatible) as alternate `IBlobStore` backend (thin)

- **Status:** **PROPOSED** — awaiting Kevin review + ACCEPTANCE (blocking OPEN QUESTIONS below)
- **Date:** 2026-09-20
- **Depends on:** ADR-0010 (S3-compatible storage via abstraction), ADR-0019 (tenancy/AuthZ), ADR-0020 (CSRF), ADR-0023 (soft-delete; blobs left in place), T-3.2.06 (`IBlobStore` + Postgres `ResourceBlobs`, 5 MiB cap)
- **Revises:** nothing yet — on ACCEPTANCE it would authorize an alternate `IBlobStore` backend alongside the Postgres default; no AuthZ/tenancy/soft-delete semantic changes
- **Does not authorize (firewall):** AuthZ/tenancy changes of any kind; soft-delete semantic changes; public buckets; browser-direct reads/writes (bare presigned URLs); raising the 5 MiB cap; Whisper / cloud LLM / audio digitizer changes; unattended ML auto-marks; Q9 realtime; pitch; YouTube; MusicXML / Guitar Pro; Event/RSVP mail; dropping the `ResourceBlobs` table before verified backfill

### Context

File Resources (T-3.2.06) store bytes in Postgres (`ResourceBlobs`) behind the `IBlobStore` abstraction, capped at 5 MiB, served through the AuthZ'd `GET .../content` proxy. Postgres blobs are operationally sufficient today but couple binary growth to the primary database. A thin **alternate backend** on Cloudflare R2 (S3-compatible) would let deployments offload bytes without changing the Resource model, AuthZ, or read path.

### Proposal (PROPOSED — R2-Q1–Q7 open, Kevin decides)

1. **Backend thin:** new `R2BlobStore : IBlobStore` in Infrastructure, registered **conditionally** (R2 configured → R2, else Postgres default). No change to the `IBlobStore` contract or the `GET .../content` route shape.
2. **Verified facts informing the proposal (vendor docs, `developers.cloudflare.com/r2/pricing` + documented R2 dotnet example — re-verify at implementation time):**
   - R2 free tier includes 10 GB-months storage + 1M Class-A + 10M Class-B operations/month + **zero egress fees**.
   - S3-compatible ops Put/Get/Delete/Head + presigned URLs are supported; gaps (ACLs, tagging, KMS, POST-presigns) are **unused by Sonivo** and stay unused.
   - `AWSSDK.S3` against R2 needs `DisablePayloadSigning` + `DisableDefaultChecksumValidation`, `ServiceURL https://<ACCOUNT>.r2.cloudflarestorage.com`, region `auto` (per the documented R2 dotnet example).
3. **Server proxy stays:** KEEP the server proxy through the AuthZ'd `GET .../content` (per-request Membership recheck per ADR-0019). **No public buckets, no bare presigned reads** — bearer-token URL risk. (Browser-direct PUT is likewise OUT — no CORS surface needed; see R2-Q4.)
4. **Config (never in git):** `R2:AccountId` / `R2:AccessKey` / `R2:Secret` / `R2:BucketName`, per-env (local / Render). Secrets live in environment config only.
5. **Migration (dual-read + lazy backfill, proposed):** dual-read R2-first with Postgres fallback; lazy backfill of `ResourceBlobs` rows into R2 on read; `Resource` rows/metadata stay in Postgres always. Drop the `ResourceBlobs` table only in a **later migration after verified backfill** — never in the thin cutover.
6. **Cap unchanged:** 5 MiB upload cap UNCHANGED unless a later ADR says otherwise.
7. **Spanish UI:** no user-visible copy change expected in thin (ops-only); any error copy stays Spanish.
8. **Tickets (gated on ACCEPTANCE + R2 credentials provided):** T-R2-00 (this proposal docs); T-R2-01–03 implementation — see [`PHASE-R2-SPEC.md`](PHASE-R2-SPEC.md). No implementation branch authorized until Kevin ACCEPTS and resolves R2-Q1–Q7.

### Open questions (blocking — Kevin decides, auditors do NOT commit unilaterally)

| ID | Question |
| -- | -------- |
| **R2-Q1** | Account ownership + Admin token holder: whose Cloudflare account owns the R2 account, who holds the Admin token? |
| **R2-Q2** | Bucket name + jurisdiction: canonical bucket name(s) per environment + jurisdiction/data-location choice. |
| **R2-Q3** | Scoped read/write token + per-env secret storage: least-privilege token scope, rotation story, where secrets live per environment (local / Render env). Never in git. |
| **R2-Q4** | Proxy-only confirm: confirm server-proxy-only (no browser-direct PUT → no CORS needed), no public buckets / bare presigned reads. |
| **R2-Q5** | Orphan-blob lifecycle vs ADR-0023: ADR-0023 leaves Resource rows/blobs in place on Arrangement soft-delete — confirm the same rule applies to R2 objects (purge stays FUTURE) or define the R2 variant. |
| **R2-Q6** | Cost ceiling / overage acceptance: who accepts overage beyond the free tier, alerting/ceiling story. |
| **R2-Q7** | Card-on-file at R2 checkout (unconfirmed in docs): confirm whether card is required and who provides it. |

### Consequences (if ACCEPTED as proposed)

- Deployments with R2 configured store new bytes in R2; Postgres remains the default/fallback and the metadata store.
- The `GET .../content` AuthZ posture is unchanged (proxy, per-request Membership recheck, 404/403 per ADR-0019).
- The `ResourceBlobs` table survives until a later verified-backfill migration explicitly drops it.

### Non-goals

AuthZ/tenancy changes · soft-delete semantic changes · public buckets / bare presigned URLs · browser-direct PUT / CORS · 5 MiB raise · Whisper · cloud LLM · unattended ML auto-marks · Q9 · pitch · YouTube · MusicXML · Event/RSVP mail

---

## ADR-0034 — ML timing-mark suggest (review-gated mapping assist)

- **Status:** **ACCEPTED** — **HUMAN-DELEGATED 2026-09-20** (Kevin: program continues until done; auditor decides technical spend-free scope)
- **Date:** 2026-09-20
- **Depends on:** ADR-0032 (digitizer segments + review UX); ADR-0025 (PATCH/409); ADR-0028 (ChordPro)
- **Revises:** nothing — T-W32-02 already defaults segment→line identity; this ADR authorizes one smarter client-side suggestion
- **Does not authorize:** auto-save of any marks (every write still requires Owner Aplicar via PATCH), cloud LLM, Q9, pitch, YouTube, S3, new tables, server changes of any kind

### Context

T-W32-02 pre-fills each transcript segment to its positional line (segment i → line i). Real ChordPro bodies carry directives (`{start_of_verse}`), comments, and blank lines, so identity mapping plants marks on non-lyric lines. Owners then hand-fix every row. A deterministic, review-gated suggester closes the remaining Wave C gap: ML segments exist (Wave A), unattended auto-save stays forbidden (firewall).

### Decision (ACCEPTED)

1. **Pure client function `suggestLineMapping(chordProText, segmentCount)`** (web, `digitize.ts`): collect 0-based indices of lyric-bearing lines — non-blank lines that are not `{directive}` blocks; map segment i to the i-th lyric line; clamp overflow segments to the last lyric line. Zero lyric lines (or null/blank body) → identity clamped to `max(lineCount - 1, 0)`; zero segments → `[]`.
2. **Review UX:** one “Sugerir mapeo” button (`digitize-suggest`) in the ready phase fills the per-segment line inputs; Owner edits freely, then Aplicar/Añadir/Descartar unchanged. Suggest never writes anything by itself.
3. **No server changes.** No new deps. Spanish copy. Playwright **TC-WSP-02** (speech fixture: chords with a directive + a blank line; assert suggested `1`/`3`, apply, Practice toggle appears).
4. **Tickets:** T-W34-01 (this slice: util + button + TC-WSP-02). Branch `feature/t-w34-suggest-marks`.

### Consequences

- Wave C (ML auto-marks) is CLOSED as review-gated suggest; the unattended variant stays FUTURE behind its own ADR.
- Suggest is deterministic and fully covered by E2E (web has no unit framework — known gap, unchanged).

### Non-goals

Auto-save · cloud LLM · server-side mapping · Q9 · pitch · YouTube · S3 · MusicXML

## ADR-0033 — Cloud LLM upgrade of ChordPro P1 text-digitizer + P2 compose assist (thin)

- **Status:** **SUPERSEDED** — Wave B closed 2026-09-20 under Option C below (HUMAN-DELEGATED: Kevin “la opción que sea más conveniente”; auditor decision with rationale). Deterministic P1/P2 per ADR-0030 remain the standing decision. L33-Q1–Q6 recorded as resolved-moot for reference; a future ADR may reopen with usage evidence.
- **Date:** 2026-09-20
- **Depends on:** ADR-0019, 0020, 0025, 0027, 0028, 0030 (P1/P2 deterministic baseline); T-3.2.06 file/link Resources
- **Revises:** nothing yet — on ACCEPTANCE it would revise ADR-0030 §2–3 clauses that keep P1/P2 deterministic-only (“Not cloud LLM in this thin”) into an opt-in cloud-assisted upgrade; the deterministic engines stay as offline fallback
- **Does not authorize (firewall):** Whisper / audio-digitizer changes (Wave A done, ADR-0032), unattended ML auto-marks saved without Owner review (Wave C), realtime multi-device sync (Q9), pitch detection, YouTube, S3 blob adapter, raising the 5 MiB blob cap, MusicXML / Guitar Pro, Event/RSVP mail

### Context

ADR-0030 shipped P1 (Owner pastes plain lyrics + chord list → deterministic placer → ChordPro + syllable-nudge studio) and P2 (Owner brief → template/rule-generated structured ChordPro) as **deterministic** tooling with no vendor secrets. Groups now hit the ceiling of rules: P1 misplaces chords on irregular meter, P2 templates repeat themselves. A thin **cloud-LLM upgrade** would offer Owner-invoked “Mejorar con IA” / “Generar con IA” actions that send the Owner’s own draft input to a hosted LLM and return a **draft** the Owner reviews and explicitly saves — reusing the existing Arrangement PATCH (`expectedVersion` / 409 per ADR-0025) with the deterministic engines kept as the offline fallback.

### Proposal (PROPOSED — L33-Q1–Q6 open, Kevin decides)

1. **Scope thin:** P1 upgrade = lyrics + chord list → LLM-proposed ChordPro placement (replaces only the placer output, still editable in the existing nudge studio). P2 upgrade = brief → LLM-proposed structured ChordPro with `{start_of_verse}` / `{start_of_chorus}` (still editable; “variar progresión” / “reescribir sección” may call the LLM again). P0 transpose/views unchanged (deterministic, no LLM).
2. **Draft-only:** LLM output is a **draft** until an Owner explicitly saves via the existing PATCH `chords` path. No auto-save, no background generation, no unattended marks.
3. **Fallback:** deterministic P1 placer + P2 templates remain fully functional with no network/vendor configured (offline path). When the vendor is unreachable or unconfigured, the UI falls back to the deterministic output with a clear Spanish notice — exact fallback UX per L33-Q5.
4. **No new persistence tables** in thin (existing `Arrangement.Chords` text column only). No new blob MIME requirements. Server never stores vendor keys in the DB in this proposal (config model per L33-Q2).
5. **Roles:** generate actions default Owner-only (same `RequireOwnerAsync` pattern as other Arrangement mutations); Member read-only consumes saved `Chords`. Whether Members may invoke generation is L33-Q6.
6. **Spanish UI** for generate/review surfaces (“Generar con IA”, “Revisar borrador”, “Aplicar”, “Descartar”); sparse Playwright TCs per thin spec (T-LLM-03).
7. **Tickets (gated on ACCEPTANCE):** T-LLM-00 (this proposal docs); T-LLM-01–03 implementation — see [`PHASE-LLM-SPEC.md`](PHASE-LLM-SPEC.md). No implementation branch authorized until Kevin ACCEPTS and resolves L33-Q1–Q6.

### Vendor comparison (neutral — FACTS about dimensions, no recommendation stated as fact)

| Dimension | Option A: hosted general LLM API (e.g. OpenAI-compatible chat endpoint) | Option B: hosted general LLM API, alternative vendor (e.g. Anthropic-compatible messages endpoint) | Option C: no vendor (stay deterministic, close Wave B without cloud) |
| --------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Integration shape | HTTPS chat-completions-style call, server-side only | HTTPS messages-style call, server-side only | No integration |
| Secrets / config | Vendor API key via server config (model per L33-Q2) | Vendor API key via server config (model per L33-Q2) | None |
| Cost model | Per-token metered billing; caps needed (L33-Q3) | Per-token metered billing; caps needed (L33-Q3) | Zero marginal cost |
| Privacy surface | Owner-supplied lyrics/brief leave the server to the vendor (retention per L33-Q4) | Same — content leaves the server to the vendor (retention per L33-Q4) | Content never leaves the server |
| Offline behavior | Falls back to deterministic engines (L33-Q5) | Falls back to deterministic engines (L33-Q5) | Always available |
| Output quality (ASSUMPTION, not verified) | Expected better placement/variety than rules | Expected better placement/variety than rules | Capped at rule quality |

*Auditor lean (clearly labeled opinion, NOT a decision): Option A or B are functionally interchangeable for this thin — the binding choice is Kevin’s (L33-Q1). If forced to pick a default for the proposal, the auditor would lean toward whichever vendor Kevin already bills (to avoid a second paid account), with per-group opt-in + hard caps; but this lean authorizes nothing and must not be read as ACCEPTED.*

### Resolution — Wave B closed under Option C (2026-09-20, HUMAN-DELEGATED)

**Decision: Option C — no cloud vendor.** Rationale: (1) zero marginal cost vs metered billing with no billing infra; (2) zero secrets/ops burden (no keys, rotation, caps monitoring); (3) user lyrics never leave the server (no retention policy or consent surface needed); (4) single always-available path (no degraded fallback UX to design); (5) deterministic P1/P2 already deliver the thin value (ADR-0030, shipped + tested); (6) no usage evidence that rules are insufficient — buying vendor capacity now would be premature. **Reversible:** a future ADR may reopen the upgrade with usage evidence; L33-Q1–Q6 stand answered-moot and reusable as the question set.

### Open questions (Kevin decides — auditors do NOT commit unilaterally)

| ID | Question |
| -- | -------- |
| **L33-Q1** | Vendor choice: OpenAI vs Anthropic vs other vs Option C (no cloud)? Auditors do not commit Sonivo to a paid vendor unilaterally. |
| **L33-Q2** | Secrets/config model + per-env provisioning: config key names, where keys live per environment (local / Render), rotation story. Never in git. |
| **L33-Q3** | Cost caps / rate limits: per-group quotas, max tokens per call, monthly ceiling, behavior when exceeded. |
| **L33-Q4** | Privacy: lyrics/briefs are user content sent to the vendor — retention policy, data-processing terms, user notice/consent copy. |
| **L33-Q5** | Fallback behavior when the vendor is unreachable or unconfigured: exact UX + whether generation buttons hide or degrade to deterministic. |
| **L33-Q6** | Member vs Owner access to generate actions: Owner-only (default) or Members may generate drafts for Owner save? |

### Consequences (if ACCEPTED as proposed)

- P1/P2 gain an opt-in cloud draft path; deterministic engines stay as the offline fallback.
- Sonivo gains its first paid-vendor dependency and first user-content-egress surface — both bounded by L33-Q1–Q6 answers.
- Wave C (unattended ML auto-marks) still needs its own ADR; this thin must not be read as authorizing it.

### Non-goals

Whisper changes · unattended ML auto-marks · Q9 realtime/multi-device · pitch · stems/mixer · YouTube · S3 · raising 5 MiB · MusicXML · Guitar Pro · Event/RSVP mail

---

## ADR-0032 — Whisper audio digitizer thin (audio → timing-mark + lyric drafts)

- **Status:** **ACCEPTED** — **HUMAN-DELEGATED 2026-09-20** (Kevin: “elige las opciones que queden mejor para el proyecto e implementa”; auditor decided W32-Q1–Q7 below, rationale in PR)
- **Date:** 2026-09-20
- **Depends on:** ADR-0019, 0020, 0024, 0025, 0027, 0028, 0029, 0030, 0031; T-3.2.06 file/link Resources
- **Revises:** ADR-0030 / ADR-0031 clauses keeping audio→ChordPro digitizer FUTURE — a thin Owner-reviewed digitizer is now authorized as specified below (unattended ML auto-marks stay FUTURE, Wave C)
- **Does not authorize (firewall):** cloud LLM lyric/chord rewriting (Wave B), ML auto-marks saved without Owner review UX (Wave C), realtime multi-device sync (Q9), pitch detection, YouTube, S3 blob adapter, raising the 5 MiB blob cap, MusicXML / Guitar Pro, Event/RSVP mail

### Context

Groups rehearse from audio maquetas stored as Arrangement Resources (ADR-0024; T-3.2.06). Owners today hand-transcribe lyrics into ChordPro (`Arrangement.Chords`, ADR-0028 / ADR-0030) and hand-place Practice follow-along time marks (`Arrangement.ChordTimingJson`, ADR-0031). A thin digitizer turns an **existing audio file Resource** into a **draft** the Owner reviews and explicitly saves — feeding the existing `Lyrics` + `ChordTimingJson` columns with **no new tables** and **no new vendor secrets**.

### Decision (ACCEPTED — W32-Q1–Q7 resolved)

1. **Q1 provider: local whisper.cpp via Whisper.net, default model `tiny`** (config `base`). Zero vendor secrets, zero cost, audio never leaves the server. Limited transcription quality is acceptable because output is an Owner-reviewed draft only. Hosted transcription APIs remain FUTURE (Wave B-adjacent, separate ADR).
2. **Q2 execution: async job — `202 Accepted` + polling.** Transcription is CPU-bound (tens of seconds); async avoids HTTP/proxy timeouts on Render free tier. Job state lives in an **in-memory store with expiry** (no new table in thin; restarts may drop in-flight jobs — documented, not silent).
3. **Q3 eligibility: `file`-kind Resources with playable audio MIME** (purposes `audio` / `practice` / `click`, same playability rule as Practice). Link Resources are OUT (server must read bytes; link fetching is SSRF surface; YouTube is firewall). Thin decoder is WAV-only: non-WAV audio is rejected at POST with a clear Spanish error, never a doomed job.
4. **Q4 output: segments → (a) timing-mark drafts + (b) lyric-text draft. `Chords` NEVER touched by the digitizer** (protects hand-made ChordPro). Each segment `{startMs, endMs, text}` maps in review UX to `{lineIndex, atMs=startMs}` applied via the existing PATCH `chordTimingJson` path (upsert semantics — hand-made marks on other lines are preserved); segment text may be appended to `Lyrics` via explicit Owner action through the existing PATCH `lyrics` path. Smart seeding of `Chords` stays with Wave B.
5. **Q5 caps: blob ≤5 MiB (unchanged, NOT raised) + audio duration ≤120s + segments ≤500** (far below server `MaxMarks = 2000`); jobs expire after 30 min. Over-cap input fails the job with a clear error, never partial writes.
6. **Q6 config (no secrets in thin): `Whisper:Model`** (`tiny`\|`base`, default `tiny`), **`Whisper:ModelDirectory`** (model `.bin` location, environment-provisioned), **`Whisper:MaxAudioSeconds`** (default 120). Model weights download lazily on first job — never in git, never in DB. Render ephemeral disk (re-download after sleep/restart) is documented.
7. **Q7 visibility: drafts are Owner-only.** Transcription endpoints require Owner (same `RequireOwnerAsync` pattern as other Arrangement mutations); job ids are unguessable Guids scoped to `(groupId, arrangementId)` and re-checked per request (ADR-0019: 404 non-member/unknown, 403 member non-Owner). Members consume only saved `Lyrics` / marks.
8. **Writes use existing PATCH semantics only** (`expectedVersion` / 409 per ADR-0025); CSRF per ADR-0020 (POST is unsafe, GET status is safe). Concurrency mechanism unchanged.
9. **Spanish UI** for the draft review surface (“Digitalizar audio”, “Revisar borrador”, “Aplicar marcas”, “Añadir a letra”, “Descartar”); sparse Playwright **TC-WSP-01** in T-W32-03.
10. **Tickets:** T-W32-00 (proposal docs, merged PR #83); T-W32-01–03 implementation — see [`PHASE-WHISPER-SPEC.md`](PHASE-WHISPER-SPEC.md).

### Consequences

- Audio maquetas gain a draft path into follow-along marks + lyrics without new aggregates, tables, or vendors.
- “Digitizer” output stays a **draft** until an Owner saves it; saved `Lyrics` / `ChordTimingJson` keep current GET/PATCH/AuthZ semantics.
- Wave B (cloud LLM upgrade) and Wave C (unattended ML auto-marks) each need their own ADR; this thin must not be read as authorizing them.

### Non-goals

Cloud LLM rewriting · unattended ML auto-marks · Q9 realtime/multi-device · pitch · stems/mixer · YouTube · S3 · raising 5 MiB · MusicXML · Guitar Pro · Event/RSVP mail

---

## ADR-0031 — Practice ChordPro follow-along (Owner time marks + highlight)

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-18** Kevin Esquivel — authorize follow-along thin (full backlog program)  
- **Date:** 2026-09-18  
- **Depends on:** ADR-0027, 0028, 0029, 0030  
- **Revises:** ADR-0029 clause that treated time-synced lyric/ChordPro marks as FUTURE-only — Practice MAY highlight the current ChordPro line (or block) from Owner-authored timing marks while audio plays  
- **Does not authorize:** Whisper / cloud STT, cloud LLM, auto-generated marks from ML, realtime multi-device sync (Q9), pitch detection, YouTube, S3 blob adapter, raising the 5 MiB blob cap

### Context

ADR-0029 shipped a usable Practice player with manual ChordPro scroll. Musicians still lose their place when rehearsing with audio. Full karaoke/realtime (Q9) and ML-generated marks are out of scope; a thin **Owner-authored** timing map plus client highlight reuses the existing HTML5 `timeupdate` path.

### Decision (ACCEPTED)

1. **Product:** while Practice audio plays, ChordPro **highlights the current line** (or contiguous block) driven by Owner-authored time marks. Toggle optional **“Seguir letra”** (on/off; prefer `localStorage` for the preference).  
2. **Source of truth** for chart text remains `Arrangement.Chords` (ChordPro) per ADR-0028 / 0030. Timing does **not** replace or fork ChordPro into a second body.  
3. **Timing persistence:** nullable string column **`ChordTimingJson`** on **Arrangement** (not overloaded into `Notes`). JSON array of `{ "lineIndex": number, "atMs": number }` (0-based line index into the ChordPro body as rendered/split for mark editing; `atMs` = audio position in milliseconds). Empty / null = no follow-along marks. One nullable column only — **no new table**. EF migration lands in **T-SYNC-01** (not docs-only).  
4. **Roles:** Owner creates/edits/clears marks (PATCH Arrangement); Member **read-only** consumes marks on Practice. Same AuthZ pattern as other Arrangement body fields.  
5. **Player:** reuse ADR-0029 custom chrome / HTML5 `<audio>` `timeupdate` (and seek) to resolve the active mark — no websocket, no conductor.  
6. **Spanish UI**; sparse Playwright **TC-PLAY-SYNC-01** in T-SYNC-03.  
7. **Tickets:** T-SYNC-00 (this ADR + [`PHASE-PLAY-SYNC-SPEC.md`](PHASE-PLAY-SYNC-SPEC.md)); T-SYNC-01–03 implementation — see that spec.  
8. **Firewall unchanged:** no Whisper, cloud LLM, Q9 realtime, pitch, YouTube, S3, raising 5 MiB, ML auto-marks.

### Consequences

- ADR-0029 Wave 2 “manual scroll only / time-sync FUTURE” is superseded for **Owner-authored** follow-along highlight (not multi-device realtime).  
- Arrangement GET/PATCH grow one optional field; Practice highlight is SPA-only given marks + audio.  
- Whisper / audio digitizer remain a later ADR (may seed marks later; not this thin).

### Non-goals

Whisper · cloud LLM · ML auto-marks · Q9 multi-device · pitch · YouTube · S3 · MusicXML · karaoke scoring

---

## ADR-0030 — ChordPro rehearsal intelligence module (transpose, text digitizer, compose assist)

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-18** (Kevin Esquivel — “Acepto todo” on ChordPro+IA product proposal)  
- **Date:** 2026-09-18  
- **Depends on:** ADR-0025, 0027, 0028, 0029  
- **Revises:** ADR-0028 non-goal that treated **transpose** as FUTURE-only — Practice/Arrangement MAY offer visual (and Owner-save) transposition of ChordPro chord tokens  
- **Does not authorize:** Whisper / cloud STT, cloud LLM providers, audio→ChordPro digitizer, pitch detection, YouTube, realtime conductor (Q9), MusicXML, Guitar Pro, raising 5 MiB blob cap

### Context

Groups need ChordPro that stays syllable-aligned, changes key in rehearsal, and can be created from messy inputs (plain lyrics + loose chords) or from a creative brief — without leaving Sonivo’s Arrangement-centric library. Full “AI” (Whisper + LLM) is desirable later; thin must ship value without new vendor secrets or opaque server ML.

### Decision (ACCEPTED)

1. **Source of truth** remains `Arrangement.Chords` (and optional `Lyrics`) as ChordPro-compatible text (ADR-0028). No orphan `.cho` aggregate.  
2. **Priority slices (authorized now):**  
   - **P0 — Transposición + vistas de ensayo:** client transpose of `[chord]` tokens by semitone; Practice view modes (p.ej. cantante / guitarrista: hide or emphasize chords). Prefs in `localStorage`. Owner MAY **Guardar tono** (PATCH chords + optional `defaultKey`) after confirming.  
   - **P1 — Digitalizador de texto (thin):** Owner pastes plain lyrics + ordered/loose chord list; a **deterministic** placer produces ChordPro; UI “estudio” to nudge chords by syllable/word (click / ←→). Soft confidence styling optional. **Not** cloud LLM in this thin.  
   - **P2 — Asistente de composición (thin):** Owner-only brief (género, tonalidad, idea); generates structured ChordPro with `{start_of_verse}` / `{start_of_chorus}` via **templates/rules**; actions: variar progresión, reescribir una sección manteniendo métrica cuando sea posible. **Not** cloud LLM in this thin.  
3. **Deferred (explicit FUTURE ADRs):** audio digitizer (Whisper + chord timeline), cloud LLM upgrade of P1/P2, diagram frets as first-class, realtime sync.  
4. **Roles:** P1/P2 write paths **Owner**; P0 view modes + local transpose preview **Owner + Member**; save transpose to server **Owner**.  
5. **No new persistence tables** for thin. No new blob MIME requirements beyond T-3.2.06.  
6. **Spanish UI.** Playwright sparse TCs per thin spec.  
7. **Firewall unchanged:** no Q9, pitch, YouTube, Event/RSVP mail expansion.

### Consequences

- Transpose becomes a first-class Practice control.  
- “IA” in marketing for P1/P2 thin means **assisted deterministic tooling**; vendor AI is a later ADR.  
- Audio maquetas remain normal `audio` Resources until a digitizer ADR.

### Non-goals

Whisper · OpenAI/Anthropic/etc. in-process · realtime · pitch · stems · MusicXML

---

## ADR-0029 — Practice audio player (Arrangement v1; Event/Setlist queue next)

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-17** (Kevin Esquivel — “Acepto todo” Wave plan)  
- **Date:** 2026-09-17  
- **Depends on:** ADR-0027, 0028; T-3.2.06 file/link Resources  
- **Revises:** ADR-0027 “single primary `<audio>` control” — Practice MAY use a custom player chrome over the same HTML5 media element  
- **REVISED by ADR-0031:** Owner-authored ChordPro line timing + Practice highlight (“Seguir letra”) is **authorized**; multi-device realtime (Q9) remains FUTURE  
- **Does not authorize:** realtime sync (Q9), pitch detection, YouTube API, streaming CDN, stems mixer, raising the 5 MiB blob cap (separate ops ADR)

### Context

Thin Practice (ADR-0027) exposes one playable Resource via native browser controls. Musicians need a **usable rehearsal player**: seek, volume, and choosing among multiple `audio`/`click` Resources while reading ChordPro/lyrics. Setlist/Event queue is valuable but must not block Arrangement v1.

### Decision (ACCEPTED)

1. **Scope Wave 2 (Arrangement player):** enhance the existing Practice route for one live Arrangement — no new domain aggregates, no new API endpoints required. Reuse GET Arrangement + Resource list + file `content` AuthZ.  
2. **Chrome:** custom control bar (Spanish): reproducir/pausar, seek, tiempo actual/duración, volumen. Prefer one HTML5 `<audio>` under the hood (hidden or visually secondary).  
3. **Track list:** list all playable Resources with purpose `audio` then `click` (same playability rules as today). User may switch track; switching resets or keeps playhead per thin UX (default: reset to 0). Prefer last-selected track from `localStorage` when still present.  
4. **Lyrics / ChordPro:** keep ADR-0028 render beside/above the player. **Manual** scroll only in Wave 2. ~~Time-synced auto-scroll / lyric marks = FUTURE (needs format + Q9-adjacent ADR).~~ **REVISED by ADR-0031:** Owner-authored timing marks + optional highlight (“Seguir letra”) are authorized; Q9 multi-device sync remains FUTURE.  
5. **UX persistence:** volume + last track Resource id in `localStorage` keyed by Group/Arrangement — **not** server state.  
6. **Scope Wave 3 (authorized by this ADR, separate tickets):** Event plan / Setlist ordered queue with next/prev, title per item, jump to that Arrangement’s Practice. Still no realtime.  
7. **Spanish UI** labels for player chrome.  
8. **Playwright:** TC-PLAY-01 (play + seek + change track) for Wave 2; TC-PLAY-02 for Wave 3 queue.

### Consequences

- Practice becomes the product “player” surface without a second route.  
- Wave 3 builds on the same chrome with a playlist model in the SPA.  
- Large-file / S3 remains ops (T-BLOB-S3) when Neon/size hurts — not a prerequisite for Wave 2.

### Non-goals

Pitch · YouTube · karaoke scoring · conductor/realtime · multi-device sync · Event notification mail · MusicXML

---

## ADR-0028 — Chart / lyrics format (closes Q8) — hybrid ChordPro + file chart

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-17** (Kevin Esquivel — “Acepto todo” Wave plan)  
- **Date:** 2026-09-17  
- **Depends on:** ADR-0007, 0014, 0017, 0024–0025, 0027  
- **Revises:** ADR-0027 clause that treated ChordPro as FUTURE-only for Practice display — Practice **may** render ChordPro from Arrangement fields  
- **Closes:** CONTEXT **Q8** (chart format) for MVP practice/edit path  
- **Does not authorize:** MusicXML, Guitar Pro, realtime lyric sync (Q9), pitch detection, YouTube

### Context

Arrangement already has optional plain-text `Lyrics` / `Chords` / `Structure` / `Notes` (ADR-0025). Resources carry PDF/image/audio. Without a format decision, Practice and editors stay opaque. Musicians need a **typed** rehearsal format without replacing file charts.

### Decision (ACCEPTED)

1. **Hybrid model (option C):**  
   - **Editable rehearsal body:** `Arrangement.Chords` (and optionally `Lyrics`) MAY hold **ChordPro-compatible** text (OpenSong/ChordPro common subset).  
   - **Official / print chart:** Resource with purpose `chart` remains **file or link** (PDF/PNG/JPEG/WebP) — not parsed.  
2. **`Lyrics` field:** plain text **or** ChordPro lyric lines without chords; no requirement to migrate existing rows.  
3. **`Chords` field:** preferred home for ChordPro (chords + lyrics inline). Empty still allowed.  
4. **Validation (thin):** server accepts ChordPro as **opaque text** within existing max body length; **no** hard reject for unknown directives. Optional soft warnings are UI-only in this wave. Do **not** invent a second storage column.  
5. **Rendering:** Practice and Arrangement detail MAY render ChordPro into readable chords-over-lyrics when the text looks like ChordPro (`[` chord brackets or `{` directives). Fallback: monospace / preformatted plain text.  
6. **Import:** Owner MAY upload/paste a `.cho` / `.chordpro` / `.txt` ChordPro body into `Chords` (and optionally clear-file import via existing file Resource is **not** required for this ADR). Thin: paste + file-pick that reads client-side into the PATCH body.  
7. **MIME:** keep T-3.2.06 allowlist; `.cho`/`.chordpro` as `text/plain` (or add explicit types if browsers send them) — still ≤5 MiB when stored as Resource; Arrangement body remains DB text not blob.  
8. **~~Transpose, sections UI, MusicXML:~~** **REVISED by ADR-0030:** visual + Owner-save transpose of ChordPro tokens is authorized (P0). Sections UI polish and MusicXML remain FUTURE.  
9. Spanish UI: “Letra”, “Acordes (ChordPro)”, “Vista previa”.

### Consequences

- Q8 answered for Sonivo MVP practice path.  
- Parser/renderer lives in web (and optionally shared tests); Domain keeps strings.  
- ADR-0027 Practice view gains ChordPro display without new aggregates.

### Non-goals

MusicXML · Guitar Pro · OCR PDF · realtime scroll sync · forcing all Groups to ChordPro

---

## ADR-0027 — Thin practice / karaoke view (read-only Arrangement play)

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-17** (Kevin Esquivel — “Acepto todo” pipeline)  
- **Date:** 2026-09-17  
- **Depends on:** ADR-0007–0008, 0014, 0017, 0024–0025; T-3.2.06 file/link Resources  
- **Does not supersede:** Resource model; Event plan snapshots; Auth cookie model  
- **Does not authorize:** realtime sync (Q9), pitch detection, YouTube API, multi-user live conductor  
- **REVISED by ADR-0028:** ChordPro parser/render on Practice is **authorized** (hybrid ChordPro in Arrangement fields). The original “no ChordPro parser” thin ban no longer binds.  
- **REVISED by ADR-0029:** Practice MAY use custom player chrome (seek/volume/multi-track) over HTML5 audio; Event/Setlist queue is Wave 3 under the same ADR.
- **REVISED by ADR-0031:** Owner-authored ChordPro line timing + optional Practice highlight (“Seguir letra”) is **authorized**; websocket/multi-device realtime remains FUTURE.

### Context

Members need a first-class **practice** surface: see lyrics (and optionally hear audio/click) for an Arrangement without leaving Sonivo. Full karaoke/realtime is FUTURE (Q9). Thin slice is a **read-only play view** over existing Arrangement fields + Resources.

### Decision (ACCEPTED)

1. Add a **Practice** (UI: “Practicar”) view for a live Arrangement, reachable from Arrangement detail (Member + Owner).  
2. View shows: Arrangement **Label**, Song **Title**, **Lyrics** text (plain), optional **Key** / **Tempo** display. **REVISED by ADR-0028:** Lyrics/Chords MAY render as ChordPro when text looks like ChordPro.  
3. If the Arrangement has a Resource with purpose `audio` or `click` (link or file), expose **one** primary playable control (HTML5 `<audio>` for file `content` or link URL when audio MIME / known audio extension). Prefer purpose `audio`, else `click`.  
4. **No** new domain aggregates. **No** new persistence tables. Reuse existing GET Arrangement + Resource list + file `content` AuthZ.  
5. **No** websocket/realtime, **No** pitch tracking. ~~**No** scrolling sync engine beyond basic CSS scroll of lyrics~~ **REVISED by ADR-0031:** Owner time marks + highlight authorized; still **no** Event-plan karaoke mode / multi-device conductor in this thin.  
6. Spanish UI copy; routes may stay English (`/practice` or query under arrangement).  
7. Playwright: sparse TC — Owner opens Practicar and sees lyrics (fixture song with lyrics).

### Consequences

- Improves Member read UX without expanding Event or Resource semantics.  
- ~~FUTURE ADR may add realtime / conductor / ChordPro.~~ **REVISED by ADR-0028:** ChordPro display is in-scope; realtime / conductor remain FUTURE.

### Non-goals

Realtime · multi-device sync · YouTube embed · pitch detection · billing · Google Drive

---

## ADR-0026 — Google as Identity external login (cookie session)

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-17** (Kevin Esquivel — “Acepto todo” pipeline)  
- **Date:** 2026-09-17  
- **Depends on:** ADR-0009, 0011, 0020  
- **Does not supersede:** Identity as sole AuthN (0009); HTTP-only cookie web session (0011); antiforgery CSRF (0020)  
- **Does not touch:** Phase 3.9 `Gmail:*` outbound mail credentials

### Context

Email/password Identity works. Registration friction remains. Gate B forbade a Google button during UI cut; that gate is closed. External login must stay under ASP.NET Identity and the existing `sonivo.auth` cookie — no JWT web auth, no BFF (0009/0011).

### Decision (ACCEPTED)

1. Add **Google** as an **Identity external authentication** provider (`AddGoogle` / challenge → callback).  
2. On successful callback: create or link `ApplicationUser`, record `AspNetUserLogins`, then **`SignInAsync`** into the existing **`sonivo.auth`** application cookie.  
3. Email/password register + login **remain**.  
4. Config keys: **`Authentication:Google:ClientId`** / **`ClientSecret`** (and optional callback path). **Never** reuse `Gmail:ClientId` / `ClientSecret` / `RefreshToken`.  
5. Scopes thin: **`openid` `email` `profile`** only — no Gmail/Drive user scopes.  
6. **Email linking:** auto-link an existing password account **only** when Google asserts **`email_verified`**. Otherwise create a distinct user or require password sign-in then link (thin default: create when email not found; link when verified email matches).  
7. When Google asserts verified email, set **`EmailConfirmed = true`**.  
8. Google-only users may have no usable password; lockout/reset UX for them is **out of thin**.  
9. Preserve join **`?next=`** through OAuth `state` with **allowlist** (same-origin relative paths only — no open redirect).  
10. CSRF: keep ADR-0020 for mutating cookie APIs; OAuth callback remains the Identity redirect GET.  
11. CI / Playwright: **no live Google secrets required** — unit/integration with mocked external login; E2E for Google path may be skipped or faked.  
12. UI: AuthScreen control **“Continuar con Google”** (Spanish).

### Consequences

- Web session model unchanged (cookie + CSRF).  
- Ops must provision a **separate** Google Cloud OAuth client for user sign-in.  
- Account linking/unlink UI, multi-provider, mobile bearer = FUTURE ADRs.

### Non-goals

JWT/BFF · Supabase/Clerk · reusing Gmail send credentials · Drive/Gmail API on user tokens · Event/RSVP mail

---

## ADR-0025 — Song & Arrangement MVP field model

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-15** (Phase 3.1 closure)  
- **Date:** 2026-09-15  
- **Depends on:** ADR-0007, 0014, 0015, 0016, 0017, 0018, 0022, 0023, 0024  
- **Revises:**  
  - ADR-0007 clause “Creating a Song creates a Default Arrangement” → **not** a domain invariant  
  - ADR-0017 ASSUMPTION that Song create always creates Default Arrangement  
  - Persistence sketch `Songs.IsOriginal` boolean → **`OriginKind`** enum (`original` \| `cover` \| `other`)  
  - Persistence `DefaultBpm` → **nullable integer** BPM (1–400) when set  
  - Persistence / Phase 2.2 sketch **`IsDefault` removed from MVP** (no preferred-Arrangement flag)  
- **Does not supersede:** Song/Arrangement aggregate split (0007/0014); zero Arrangements ALLOW (0017); Event identity copies (0018); soft-delete/filters (0023); Resource model (0024)  
- **Aligns with:** PERSISTENCE / ADR-0023 Application soft-delete of Arrangements when Song is soft-deleted

### Context

Phase 3.1 freezes Song vs Arrangement identity and field representations. Challenge passes rejected MVP `IsDefault` and confirmed Song→Arrangement soft-delete cascade plus Song-level deletion concurrency (§8a).

### Decision (ACCEPTED)

#### Song (Group-scoped work identity)

1. **Identity:** `SongId` within a Group. Song is the **catalog work**, not a performable variant.  
2. **No global/canonical Songs** across Groups.  
3. **Title:** required, non-blank after trim. **Duplicate titles within a Group ALLOWED** — no `UNIQUE(GroupId, Title)`.  
4. **Attribution:** single **optional free-text** string. No structured contributor list.  
5. **OriginKind** (required): `original` \| `cover` \| `other`. Replaces boolean `IsOriginal`.  
6. **RightsNotes:** optional free text. No licensing workflow.  
7. **Song create does not require an Arrangement.** Zero Arrangements ALLOWED (0017). Convenience “Song + initial Arrangement” may exist as an Application use-case only (revises ADR-0007 auto-Default).  
8. **Song soft-delete — CASCADE ARRANGEMENT SOFT-DELETE (Application, same transaction):**  
   - Set `Song.DeletedAt` (+ bump Song `Version`).  
   - Soft-delete **every Arrangement of that Song where `DeletedAt IS NULL`** (set `DeletedAt`, bump each Arr `Version`).  
   - Arrangements **already** soft-deleted: leave unchanged (do not rewrite `DeletedAt`).  
   - Resources: **left in place** under those Arrangements (0023).  
   - SetlistItems / EventSetlistItems: **rows remain**; FKs valid (**RESTRICT**).  
   - **No restore in MVP.** FUTURE restore would be an explicit multi-aggregate operation (out of scope).  
   - Rationale: retiring a Song retires its live realizations; prevents “live Arrangement under deleted Song” orphans that confuse library/AuthZ; matches ACCEPTED “Arrangements inaccessible with Song soft-delete” (0017) and PERSISTENCE Application rule.

8a. **Song soft-delete concurrency contract** (`DELETE /api/groups/{groupId}/songs/{songId}`) — mirrors Group soft-delete (Phase 3.0) + ACCEPTED integer `Version` (PERSISTENCE §6):

   | Rule | Contract |
   | ---- | -------- |
   | Client `expectedVersion` | **Required** — Song’s current `Version` only (JSON body, same shape as Group DELETE) |
   | Per-Arrangement `expectedVersion` from client | **Not required** — Song deletion semantically retires all live Arrangements |
   | Song.Version on success | **Incremented** (+1) with `DeletedAt` set |
   | Each live Arrangement on success | `DeletedAt` set; **Arrangement.Version incremented** (+1 each) |
   | Already-soft-deleted Arrangements | Unchanged (no Version bump) |
   | Transaction | **One** Application/DB transaction — all-or-nothing |
   | Stale Song `expectedVersion` | **409**; **no** writes (Song or Arrangements) |
   | Concurrent Arrangement mutation before commit | Detected via existing Arrangement `Version` concurrency tokens (loaded at handler start / EF token). Conflict → **409**; **full rollback**; **never** partial cascade; **never** silent overwrite of concurrent Arr state |
   | Partial success | **Forbidden** |
   | New concurrency mechanism | **None** — reuse integer `Version` + 409 only |

#### Arrangement (separate aggregate; performable realization)

9. **Identity:** `ArrangementId` only. Label is recognition metadata, not identity.  
10. **Scope:** `GroupId` + `SongId`; composite FK (0022). Cannot move Song/Group after create (0015).  
11. **Label:** required, non-blank. **Not unique** per Song.  
12. **DefaultKey:** optional free-text. No pitch enum.  
13. **DefaultBpm:** optional **integer** 1–400 when set; **0 forbidden**.  
14. **Lyrics / Chords / Structure / Notes:** optional plain text; empty → null on write. ChordPro/structured sections FUTURE (Q8).  
15. **No `IsDefault` in MVP.** UI lists Arrangements by Label (and may sort by `CreatedAt` or show the sole Arrangement without a flag). Setlist/Event always reference `ArrangementId` explicitly. Progressive disclosure when only one Arrangement exists needs **count**, not a default flag.  
16. **Resources:** Arrangement-owned only (0024).  
17. **Arrangement soft-delete (standalone):** Resources remain; SetlistItem/EventSetlistItem FKs remain. **No restore MVP.**  
18. **Versioning:** in-place mutation only. Duplicate Arrangement = FUTURE.  
19. **Edit after Setlist/Event use:** live library updates; Event copied labels stable (0018). Templates are live refs; apply copies labels at apply time (0021).

#### Setlist / Event interaction

20. Cannot **add** a soft-deleted Arrangement to a Setlist. Existing SetlistItems **may** retain FK after Arr or Song soft-delete. Soft-delete Arr (or Song cascade) while referenced is **allowed**. Apply Setlist **fails** if any template Arrangement is soft-deleted (0021) — including Arrs soft-deleted via Song cascade.  
21. **SetlistItems are not cascade-deleted** when Song or Arrangement is soft-deleted. Template remains; Apply is blocked until Owner removes/replaces unusable items.  
22. EventSetlistItem historical display uses copied labels only — **never** requires live Song/Arrangement or `IgnoreQueryFilters()` (0018/0023).

#### Concurrency

23. Song and Arrangement integer `Version` (PERSISTENCE §6). Owner PATCH / standalone soft-delete require that root’s `expectedVersion` → **409** on mismatch. Soft-delete Song uses **§8a** (Song-level client `expectedVersion` + transactional cascade; Arr Versions bumped server-side; Arr concurrency tokens prevent silent overwrite). Resource hard-delete does not bump Arrangement Version (PERSISTENCE default).

#### Search

24. No tags. Future search: Title, Attribution, Label, DefaultKey.

### Rejected alternatives

| Alternative | Why rejected |
| ----------- | ------------ |
| `IsDefault` / “set default” API | No MVP workflow; Setlist/Event pick Arr explicitly; Labels + list UX suffice; adds ≤1 constraint, delete/reassign lifecycle, partial unique, concurrency across Arrs |
| `UNIQUE(GroupId, Title)` | False positives |
| Structured attribution / rights taxonomy | Scope creep |
| Auto-create Default Arrangement as invariant | Conflicts with zero-Arr ALLOW |
| Leave Arrangements “live” under soft-deleted Song | Orphan / AuthZ / library inconsistency |
| Require deleting all Arrangements before Song | Hostile UX |
| Cascade-delete SetlistItems on Song/Arr soft-delete | Templates ≠ Events; destroys reusable plans unnecessarily |
| Arrangement version history | Out of MVP |

### Consequences

- Persistence/API align to OriginKind, integer BPM, required Labels, duplicate titles ALLOWED, Song create without Arrangement, no `IsDefault`.  
- Song soft-delete concurrency per §8a. Implementation of Song/Arrangement/Resource still requires **explicit** phase authorization.

### Explicitly deferred (FUTURE)

`IsDefault` / preferred Arrangement · Arrangement duplicate · version history · soft-delete restore · transposition · ChordPro · tags · global song catalog · decimal BPM · Song-level Resources

---

## ADR-0024 — Practice Resources and Part Metadata

- **Status:** **ACCEPTED** — **HUMAN-APPROVED 2026-09-15** (Phase 3.0.3 closure)  
- **Date:** 2026-09-15  
- **Depends on:** ADR-0007, 0008, 0017, 0018, 0023  
- **Revises:** ADR-0017 §2 Resource purpose enum (adds `practice`; required Label; optional Part)  
- **Does not supersede:** ADR-0008 (Resources stay Arrangement-scoped entities; no per-purpose subclasses)

### Context

Groups rehearse by listening to materials that teach a specific **musical part** (voice or instrument) or a full-ensemble guide. Examples: soprano/alto/tenor/baritone/bass guides, guitar guide, full rehearsal mix, instrumental, click, reference. Sonivo must support bands, choirs, ensembles, and cover groups **without** becoming choir-CMS or a DAW.

ADR-0008 already forbids polymorphic asset platforms and entity-per-purpose tables. ADR-0017 kept a **small** purpose enum and put backing/stem/instrumental under `audio` + note. That enum does not distinguish **“learn my part”** practice guides from general rehearse-along audio in a way that cleanly drives Arrangement UX sections.

### Decision (ACCEPTED)

1. **Resource remains the only materials concept** — child of Arrangement (ADR-0008 unchanged).  
2. **No** `PracticeMaterial`, `VocalGuide`, or other specialized aggregates/subclasses in MVP.  
3. **Purpose enum gains `practice`** (revises ADR-0017 six-value list → seven):

   | Purpose | Use |
   | ------- | --- |
   | `chart` | Notation / structure sheets |
   | `lyrics` | Words-focused sheets |
   | `audio` | Other musical audio (instrumental/backing/mix stems as needed) — not part-learning primary |
   | `click` | Click / metronome |
   | `reference` | External example / original performance |
   | `practice` | Part guides and full-ensemble rehearsal recordings intended for learning/practice |
   | `other` | Escape hatch + note |

   Do **not** add top-level purposes such as `vocal-guide`, `backing-track`, `instrumental`, `slow-practice`, `harmony`, `rehearsal` — those distinctions belong in Label / Part / Note and UX.

4. **Kind remains** `file` \| `link`.  
5. **Label (required):** user-facing display name (e.g. “Tenor Guide — Slow”); non-blank after trim.  
6. **Part (optional string metadata):** free-text musical part name (e.g. `Tenor`, `Guitar 1`, `Lead`).  
   - **Not** a first-class `Part` entity, catalog, or enum of voices/instruments.  
   - `null` / empty = not part-specific (e.g. full rehearsal).  
   - At most **one** Part string per Resource (no multi-part targeting).  
   - Multiple Resources may share the same Part (distinguish via Label/Note).  
   - **No** DB CHECK restricting Part to `practice` only — Part MAY appear on any purpose when meaningful; validate only non-blank-when-present and max length.  
7. **Member → Part assignment is FUTURE** — Members choose materials manually.  
8. **Event interaction unchanged (ADR-0017/0018):** EventSetlistItem does **not** reference ResourceIds; Resource availability on past Events remains **NOT GUARANTEED**; no Resource snapshots.  
9. **Deletion unchanged (ADR-0017/0023):** Resource hard-delete; Arrangement soft-delete leaves Resource rows/blobs.  
10. **Technical audio fields** (duration, waveform, BPM on Resource, format/sample-rate/bitrate/codec) are **not** domain MVP. Arrangement may already carry default BPM. Storage MIME/size/`ObjectKey` stay Infrastructure.

### Considered options (rejected)

| Option | Why rejected |
| ------ | ------------ |
| B — Separate `PracticeMaterials` collection | Duplicates Resource AuthZ/storage; contradicts ADR-0008 minimalism |
| C — `VocalGuide` / per-purpose entities | Choir-centric; type explosion (ADR-0008 rejected) |
| Keep only `audio` + Part without `practice` | Collides “full rehearsal”, “instrumental”, and part guides in one UX bucket; weak filters |
| First-class `Part` aggregate + catalog | Taxonomy product; hard-codes choir/instrument lists; custom parts still needed |
| Snapshot Resources onto Event | Violates historical non-guarantee; storage/complexity; ADR-0017 forbids Resource versioning in MVP |
| CHECK Part only when Purpose=`practice` | Unnecessary cross-field invariant; Part useful on other purposes when meaningful |

### Consequences

- Persistence (when Resource implementation is authorized): add Resource `Label` (required), `Part` (optional), extend Purpose CHECK to include `practice`.  
- UX can group Arrangement materials as Practice / Charts / Lyrics / Backing audio / Click / Reference without new aggregates.  
- Extensibility: custom parts are free text; FUTURE Part catalog or Member→Part assignment can be additive.

### Explicitly deferred (FUTURE)

Member→Part assignment · practice player (tempo/loop) · stems/mixer · Resource soft-delete undo · Resource history/snapshots · Song-level Resources · Event-scoped Resources · first-class Part registry

---

## ADR-0023 — Soft-delete visibility vs historical Event integrity

- **Status:** **ACCEPTED**  
- **Accepted:** 2026-09-15 (Phase 2.2 closure — **HUMAN-APPROVED**)  
- **Date:** 2026-09-15 (Phase 2.2); **revised** Phase 2.2.1  
- **Depends on:** ADR-0016, 0017, 0018  

### Decision

1. Soft-delete uses `DeletedAt` on **Group**, **Song**, **Arrangement** only.  
2. EF Core **global query filters** on those three types: `DeletedAt == null`.  
3. **Event** uses `Status` / `CancelledAt` / `IsHidden` — not `DeletedAt`, not soft-delete filters.  
4. **Event historical identity is filter-independent:** Event + EventSetlistItems load uses **copied display fields only** (`displaySongTitle`, `displayArrangementLabel`). Normal Event read path must **never** require `IgnoreQueryFilters()` and must **not** `Include` Arrangement/Song (no filtered required navigations that can drop items).  
5. EF model: EventSetlistItem → Arrangement is **FK only** (no required navigation). Same preference for SetlistItem → Arrangement on template reads (load items without filtered Include).  
6. Soft-deleted Arrangement/Song **rows remain**; EventSetlistItem FKs stay valid (**ON DELETE RESTRICT**).  
7. On Arrangement soft-delete: **leave Resource rows and blobs in place** (inaccessible via normal Arr-scoped APIs). Explicit Resource hard-delete remains hard-delete. FUTURE blob/resource purge is **out of MVP**. Do **not** cascade-destroy Resources on Arr soft-delete.  
8. `IgnoreQueryFilters` / “include deleted” is **Infrastructure-only**, behind narrow ports (e.g. materials availability / FUTURE restore). Application must not call `IgnoreQueryFilters` directly.

### Rejected

Soft-delete filter on Event/EventSetlistItem · required Arrangement navigation on Event load · unrestricted IgnoreQueryFilters · hard-delete Resources automatically on Arrangement soft-delete · soft-delete Resource entity in MVP

---

## ADR-0022 — Cross-Group referential integrity at persistence

- **Status:** **ACCEPTED**  
- **Accepted:** 2026-09-15 (Phase 2.2 closure — **HUMAN-APPROVED**)  
- **Date:** 2026-09-15 (Phase 2.2); **revised** Phase 2.2.1  
- **Depends on:** ADR-0019  

### Decision

Application remains the **canonical** enforcer of tenancy (ADR-0019). Database composite FKs are **defense-in-depth**.

**Exact composite FK set:**

| Child → Parent | FK columns | Principal unique key | ON DELETE |
| -------------- | ---------- | -------------------- | --------- |
| Arrangement → Song | `(GroupId, SongId)` → `Songs(GroupId, Id)` | `UNIQUE (GroupId, Id)` on Songs | **RESTRICT** |
| SetlistItem → Arrangement | `(GroupId, ArrangementId)` → `Arrangements(GroupId, Id)` | `UNIQUE (GroupId, Id)` on Arrangements | **RESTRICT** |
| EventSetlistItem → Arrangement | `(GroupId, ArrangementId)` → `Arrangements(GroupId, Id)` | same | **RESTRICT** |

`UNIQUE (GroupId, Id)` exists **only** on Songs and Arrangements (required by these FKs).

Denormalized `GroupId` on SetlistItem and EventSetlistItem exists **for these FKs** (copied from parent Setlist/Event in Application).

**Simple FK only** (no composite): Resource→Arrangement, Setlist→Group, Event→Group, EventSetlistItem→Event, Membership→Group/User, RSVP→Event, Event→SourceSetlist (SET NULL).

Soft-delete leaves principal rows → composite FKs remain satisfied. Hard-delete of Arrangement is out of MVP.

Still **no** Postgres RLS.

### Rejected

Composite FKs on Resource/RSVP/Membership · UNIQUE(GroupId,Id) on every tenant table · RLS · treating composite FK as replacement for Application AuthZ

---

## ADR-0021 — Replace Event Plan from Setlist

- **Status:** **ACCEPTED**  
- **Accepted:** 2026-09-15 (Phase 2.1 closure — **HUMAN-APPROVED**)  
- **Date:** 2026-09-15 (Phase 2.0); **revised** Phase 2.1  
- **Depends on:** ADR-0016, 0018  

### Problem

“Apply Setlist” can mean populate, sync, append, merge, or replace. Ambiguity causes silent data loss when Owners customize an Event plan then re-apply a template.

### Canonical semantic

**Replace Event Plan from Setlist** = one-shot **import/copy** that **replaces** the Event’s concrete plan with a new copy of the template. Not synchronization. Not a live link. Not merge.

Setlist = reusable template.  
EventSetlistItems = Event-owned plan (independent after copy).

### Decision

1. One DB transaction; no partial writes.  
2. Validate: same Group; Event not cancelled; Setlist exists; every template Arrangement exists, same Group, **not** soft-deleted → else fail (400/409 listing blockers).  
3. **Delete all** existing `EventSetlistItem` rows for that Event, then insert copies (order, ArrangementId, template overrides if any).  
4. Copy `displaySongTitle` / `displayArrangementLabel` from **current** Song/Arrangement names at apply time (ADR-0018).  
5. Set `sourceSetlistId` (provenance only).  
6. Re-apply **allowed**; always full replace.  
7. If the Event **already has one or more** EventSetlistItems, body must include `confirmReplace: true`; otherwise **409** with clear conflict (prevents accidental wipe). Empty plan may apply without the flag.  
8. Route may remain `POST .../apply-setlist`; docs/UX must say **Replace Event Plan**.

### Scenario (binding expectation)

Template A,B,C applied → Owner reorders, edits overrides, removes B, adds D → template later changes → re-apply with confirmation → plan becomes **current template copy**; prior Event edits are **discarded**. Predictable; destructive; must be explicit in UX.

### Rejected

Append · silent skip of soft-deleted Arrangements · merge · live sync · reject-all re-apply · Setlist revision/version table for MVP

### Concurrency

Require Event `Version` / `expectedVersion` match (409 on conflict). No Setlist revision entity. Soft-delete race on Arrangement → fail apply. Concurrent dual apply → one wins via Event concurrency.

### Consequences

Hand-built / customized plans are wiped on confirmed replace. Historical integrity of **past** Events unchanged; this mutates the **current** Event plan only. Consistent with ADR-0015–0018 (copy-on-apply, tombstone labels, no live Setlist link).

---

## ADR-0020 — CSRF and cookie posture for same-site SPA

- **Status:** **ACCEPTED**  
- **Accepted:** 2026-09-15 (Phase 2.1 closure — **HUMAN-APPROVED**)  
- **Date:** 2026-09-15 (Phase 2.0); **revised** Phase 2.1  
- **Depends on:** ADR-0011  

### Decision (one coherent MVP strategy)

**Double-submit antiforgery + SameSite Lax cookie session on a same-site SPA/API.**

| Rule | Spec |
| ---- | ---- |
| Auth cookie | ASP.NET Identity application cookie: **HttpOnly**, **Secure** (non-dev), **SameSite=Lax**, dedicated name, `Path=/` |
| Topology | Dev: Vite proxy → API (browser origin = Vite). Prod: reverse proxy or API-hosted SPA so SPA and API are **same site** (preferably same origin) |
| CORS | **No** credentialed cross-origin API access in MVP |
| Antiforgery | **ASP.NET Core supported antiforgery** (cookie + request token). Do **not** invent a custom CSRF token system; framework configuration is an implementation detail that must match this strategy |
| Bootstrap | `GET /api/auth/csrf` (anonymous or authenticated) returns `{ "token": "..." }` and sets antiforgery cookie |
| SPA storage | Keep token in **memory** (or short-lived module state); refresh via bootstrap after login; do not put auth cookie in JS |
| Header | `X-CSRF-TOKEN: <token>` on mutating requests |
| Methods | **POST, PUT, PATCH, DELETE** when the request can authenticate via the auth cookie (including login/logout/register if those set or use cookies) |
| Safe methods | GET/HEAD/OPTIONS: **no** CSRF token (`/api/auth/me` included) |
| Validation | Framework compares header token to antiforgery cookie |
| Failure | **400** Problem Details (`csrf` / antiforgery) — do not proceed |
| Origin check | Defense-in-depth: reject mutating requests whose `Origin`/`Referer` is present and not an allowed same-site origin |

SameSite is defense-in-depth, **not** the sole CSRF defense.

### Login / logout

1. SPA calls `GET /api/auth/csrf` → token.  
2. `POST /api/auth/login` with `X-CSRF-TOKEN` + credentials → auth cookie.  
3. SPA calls `GET /api/auth/csrf` again (token may rotate).  
4. `POST /api/auth/logout` requires auth cookie + CSRF token.

### Rejected

SameSite-alone as sole CSRF control · `SameSite=None` for MVP web · JWT-to-avoid-CSRF · custom CSRF framework · relying on CORS alone · storing CSRF token in localStorage as the primary design

### Consequences

SPA API client must attach `X-CSRF-TOKEN` on all unsafe methods. Misconfigured multi-origin prod without proxy breaks cookies/CSRF — hosting must preserve same-site topology.

---

## ADR-0019 — Group tenancy enforcement

- **Status:** **ACCEPTED**  
- **Accepted:** 2026-09-15 (Phase 2.1 closure — **HUMAN-APPROVED**)  
- **Date:** 2026-09-15 (Phase 2.0); **revised** Phase 2.1  
- **Depends on:** ADR-0005, 0012  

### Principle (binding)

**CLIENT-SUPPLIED GROUP ID ≠ AUTHORIZATION.**  
Route `groupId` is a **claim to verify**, never a grant. Membership + role + scoped loads authorize.

### Canonical request flow

Authenticated User → Membership → Role → Scoped resource load → Cross-Group validation → Mutation/read.

### Decision

1. Group-scoped routes: `/api/groups/{groupId}/...`.  
2. Every Group-scoped use-case: Authenticated User → load Membership `(userId, groupId)` → else **404** → then role AuthZ → else **403**.  
3. Never trust Group headers/cookies as authority (UI selection is hint only).  
4. Tenant repositories/queries for Group-owned entities **require** `(GroupId, EntityId)` (or equivalent filter). **Forbid** unscoped `GetById(entityId)` for tenant aggregates in Application paths.  
5. Cross-Group references: when attaching A→B, load B with **same** `GroupId`; mismatch → **404/400**. FKs alone are **not** tenant isolation.  
6. Denormalized `GroupId` on Song, Arrangement, Resource (via Arrangement), Setlist, Event, etc. is **required** for query isolation and cross-check without trusting joins alone.  
7. Object keys: `groups/{groupId}/...`; AuthZ before signed URL/stream.  
8. **No Postgres RLS** in MVP.  
9. Soft-deleted Group: treat as inaccessible → **404**.

### 404 vs 403

| Case | Status |
| ---- | ------ |
| Not authenticated | **401** |
| Authenticated, not a member (or Group soft-deleted / unknown to caller) | **404** |
| Member, insufficient role | **403** |
| Member, resource missing in Group | **404** |

### Rejected

Ambient current-Group cookie without per-request membership check · client GroupId without membership verification · RLS as MVP gate · treating FK presence as tenancy · unscoped entity-id lookups in use-cases

### Consequences

Frontend `/g/:groupId` mirrors routes; server re-checks every time. Security tests must prove IDOR failure for foreign `groupId` and cross-Group id swaps. Consistent with ADR-0005 / 0012 tenancy and roles.

---

## ADR-0018 — Historical Event identity (tombstones, not snapshots)

- **Status:** **ACCEPTED**  
- **Accepted:** 2026-09-15 (Phase 1 closure — **HUMAN-APPROVED**)  
- **Depends on:** ADR-0016, ADR-0017  
- **Revises:** ADR-0017 §4 “Song/Arrangement display titles MAY live” for **Event history display**  
- **Does not** introduce content versioning.

### Problem

`ArrangementId` alone is insufficient for a human-readable past Event once Arrangements/Songs are soft-deleted or filtered out of normal library queries. Without a rule, agents invent full snapshots or broken “unknown item” UX.

### Distinction (binding intent)

| Tombstone identity | Snapshot / versioning |
| ------------------ | --------------------- |
| “What item was this?” — labels to recognize the planned piece | “What did the whole Arrangement look like then?” — body, resources, charts |
| **In MVP** | **OUT OF SCOPE / rejected for MVP** |

### Decision

Each **EventSetlistItem** stores:

1. Own identity (allows duplicates of the same Arrangement)  
2. `ArrangementId` (FK; retained after soft-delete of Arrangement)  
3. **Copied identity labels** captured at item create / Setlist apply time:  
   - `displaySongTitle` (required string)  
   - `displayArrangementLabel` (required string; may equal a default like `"Default"`)  
4. Order + overrides (key/BPM/capo/notes) as already proposed  
5. **Not** copied: lyrics, chords, structure, Resources, files, links  

**Historical Event UI** renders plan lines from **copied labels** + overrides + unavailable state.  
**Live materials** (when Arrangement is not soft-deleted): Member may open the current Arrangement (live body/Resources).  
**Soft-deleted Arrangement/Song:** show tombstone using copied labels; materials unavailable; do not drop the EventSetlistItem row.

### Case matrix

| Case | Display |
| ---- | ------- |
| A. Arrangement live | Labels from copies (stable plan); link to live Arrangement for materials |
| B. Arrangement soft-deleted, Song live | Tombstone: copied song title + arrangement label; materials unavailable |
| C. Same as B (Song still present) | Same — do **not** require live Song join for label |
| D. Song + Arrangement soft-deleted | Same tombstone from copies; Event remains complete |
| E. Multiple Arrangements of one Song | Distinct `displayArrangementLabel` values; each item’s own ArrangementId |
| F. Same Arrangement multiple times | Multiple EventSetlistItems; same labels OK; distinct item ids/order |

### Why not ArrangementId-only?

Soft-deleted entities are often invisible to default queries; UUID-only UX fails the “understandable history” bar. Copied **labels** are the smallest fix and are **not** content snapshots.

### sourceSetlistId (confirm)

Deleting Setlist template: EventSetlistItems unchanged; `sourceSetlistId` → **null**; Event plan intact. Templates remain acceleration only.

### Explicitly rejected

Arrangement/Resource/Setlist/Event content versioning · full Event snapshots · audit-history product · recordings/performance aggregates · ACL/chat/notifications/analytics/billing/org hierarchy

### Consistency note

ADR-0015 item “last Arrangement rejected” and live Setlist FK language are **superseded** by ADR-0016/0017/0018. Reading order for Phase 1 stack on conflicts: **0018 > 0017 > 0016 > 0015**.

---

## ADR-0017 — Phase 1.2 spine value, resource minimalism, historical contract

- **Status:** **ACCEPTED**  
- **Accepted:** 2026-09-15 (Phase 1 closure — **HUMAN-APPROVED**)  
- **Depends on:** ADR-0015, ADR-0016  
- **Revises:** portions of ADR-0016 listed below  
- **Does not supersede** ACCEPTED ADRs 0005–0014.  
- **Revised by:** ADR-0024 (**ACCEPTED** 2026-09-15) — purpose `practice`; required Label; optional Part metadata. Binding Resource purpose set is the **seven-value** list in ADR-0024. Historical contract, deletion, and Event non-guarantees in this ADR remain in force.

### Context

Phase 1.2 stress-tested whether the MVP is a recurring coordination loop, whether the Resource purpose enum is overbuilt, and whether historical Event integrity is coherent without versioning.

### 1. Spine — **SURVIVES with value reframing (ACCEPTED)**

**Smallest recurring problem:** Before the next rehearsal/performance, the group must agree **what pieces (which Arrangements)**, **in what order**, **with which one-off adjustments**, and Members must **find the current materials** and **confirm attendance**.

| Required for the loop | Supporting infrastructure |
| --------------------- | ------------------------- |
| Group, Membership, Owner/Member | Identity account |
| Arrangement (+ Song identity) | Progressive multi-Arrangement UI |
| Resources on Arrangement (enough to open materials) | Rich purpose taxonomy |
| Event + EventSetlistItems | Setlist **template** (accelerates reuse; not strictly required for a one-off Event built by hand) |
| Member view + RSVP | Invite polish |

**Song → Arrangement → Setlist → Event** remains sufficient **if** Event + Member access are treated as part of the MVP proof — not optional polish after song CRUD.

**Setlist template** is valuable reuse, not the value itself. An Owner can build EventSetlistItems directly; templates are an optimization.

**Nothing missing that justifies MVP scope expansion** (no chat, tasks, casting, or versioning).

### 2. Q17 Resource purpose — **REVISED ADR-0016 enum (ACCEPTED)**

Challenge of prior eight values: `backing` / `stem` / `instrumental` are media-library subtypes that do not change MVP coordination behavior; they belong in the optional **note**.

**Minimum MVP purpose enum:**

| Value | Scenario | Behavior impact |
| ----- | -------- | --------------- |
| `chart` | Chord/structure sheet for players | Filter/find playable notation |
| `lyrics` | Words-focused sheet (vocalists) | Distinct prep from instrumental chart |
| `audio` | Backing, stem, instrumental, mix — any rehearse-along audio | Find “something to play along to” |
| `click` | Click/metronome track | Distinct from musical audio |
| `reference` | YouTube/example performance link | External reference, not primary chart |
| `other` | Escape hatch | + note |

**Binding purpose set:** ADR-0024 (**ACCEPTED**) adds `practice` → seven values. Do **not** reintroduce `backing`/`stem`/`instrumental` as purposes.

**Rejected as first-class MVP purposes:** `backing`, `stem`, `instrumental` (use `audio` + note).  
Still: kind `file` \| `link`; optional note; strict enum validation.

### 3. Resource lifecycle — **CONFIRM hard delete; clarify history (ACCEPTED)**

EventSetlistItems reference **ArrangementId only** — **not** ResourceIds.

| Scenario | User sees | History truthful? |
| -------- | --------- | ----------------- |
| A/B Resource deleted before/after Event | Arrangement materials list without that Resource; Event order/overrides unchanged | Yes for plan; **not** for “which files existed that night” |
| C Resource replaced | Current Resources only | Yes for plan; file lineage **NOT GUARANTEED** |
| D Broken URL/file | Link/file may fail at open time | Availability **NOT GUARANTEED** |

**No** Resource snapshotting/versioning in MVP.  
**Hard delete** of Resource remains acceptable under this contract. Soft-delete Resource is **DEFERRED** (optional undo UX later), not required for history.

### 4. Historical Event contract — **ACCEPTED (explicit; labels per ADR-0018)**

Six months later, Sonivo promises:

| Category | Classification |
| -------- | -------------- |
| A. Event occurrence (time, type, status, location, notes) | **MUST** stable |
| B. Repertoire/order (EventSetlistItems: ArrangementId, order, overrides) | **MUST** stable |
| C. Arrangement musical body at that time | **NOT GUARANTEED** (live) |
| D. Resource availability/set at that time | **NOT GUARANTEED** |
| E. Member RSVP history | **MUST** stable |
| Soft-deleted Arrangement/Song on an item | **MUST** keep row + **tombstone** display |
| Song/Arrangement **library** titles when browsing live catalog | **MAY** live |
| Song/Arrangement labels on **past Event plan lines** | **MUST** use copied identity on EventSetlistItem — see **ADR-0018** (revises earlier “MAY live” for Event history) |

Intentionally imperfect MVP boundary: history = **what we planned**, not a forensic archive of charts/files.

### 5. Delete / retention — **mostly CONFIRM; two REVISIONS (ACCEPTED)**

| Entity | Rule | Notes |
| ------ | ---- | ----- |
| Group | Soft-delete | ACCEPTED intent ADR-0013 |
| Song | Soft-delete | Unchanged (ACCEPTED) |
| Arrangement | Soft-delete; Event items tombstone | Unchanged (ACCEPTED) |
| Resource | Hard-delete | Confirmed under §3 |
| Setlist template | Hard-delete OK | Event copies remain; on delete **null** `sourceSetlistId` on Events that pointed at it |
| Event | `cancelled` + soft-hide | Unchanged (ACCEPTED) |

**Last Arrangement rule — REVISE ADR-0016:**

- Prior: blocked deleting last Arrangement.  
- **ACCEPTED:** **ALLOW** Song with **zero** Arrangements.  
- Meaning: Song is catalog identity; Arrangement is the playable unit. Zero Arrangements = incomplete Song (no status machine). Cannot place a Song on a Setlist/Event without an Arrangement.  
- Creating a Song still creates a Default Arrangement (**ASSUMPTION**) — **REVISED by ADR-0025 ACCEPTED:** not a domain invariant; Song may be created with zero Arrangements.  
- Soft-delete Song remains the way to retire identity + dependents.

### 6. Canonical value journey — **ACCEPTED**

**Prepare the next musical event**

- **Trigger:** Upcoming rehearsal/performance  
- **Goal:** Shared plan + findable materials + attendance signal  
- **Critical steps:** Ensure Arrangements/Resources exist → build/apply set order on Event → Members open materials → RSVP  
- **Outcome:** Everyone works from the same plan and current materials  
- **Recurring loop:** Next Event reuses Arrangements/templates; library accumulates  

### Still unchanged from ADR-0016 (confirmed ACCEPTED via this package)

Q18 ALLOW duplicates · Q19 copy-on-apply · Q20 event types · Q21/Q22 FUTURE · no Arrangement versioning

### Consequences

**ACCEPTED** with 0015–0018: six-value Resource purpose enum; zero-Arrangement Songs allowed; null provenance on template delete; Event identity labels per ADR-0018; historical non-guarantees documented.

---

## ADR-0016 — Phase 1.1 edge cases (setlist/event history, Q17–Q22)

- **Status:** **ACCEPTED**  
- **Accepted:** 2026-09-15 (Phase 1 closure — **HUMAN-APPROVED**)  
- **Depends on:** ADR-0007, 0008, 0013, 0014, 0015  
- **Does not supersede** ACCEPTED ADRs 0005–0014.  
- **Later revisions (also ACCEPTED):** ADR-0017 (Q17 enum, last-Arrangement, provenance nulling); ADR-0018 (Event identity labels). Unrevised clauses remain as written.

### Context

Unresolved Q17–Q22 and Event↔Setlist semantics would force schema/API invention at scaffold time.

### Spine (product)

Sonivo is **not** primarily a music library. The library is the **foundation** for coordinating rehearsal/performance. Recurring value is the weekly loop: current Arrangements → Setlist → Event → Members open the right materials.

MVP spine remains:

**Group → Song → Arrangement (+ Resources) → Setlist (template) → Event (occurrence + event setlist items) → Member view/RSVP**

### Q17 — Resource purpose → **RESOLVED (ACCEPTED; enum superseded by ADR-0017)**

- Kind: `file` | `link` (unchanged)  
- Purpose: **strict enum** (domain-validated), not free-text taxonomy  
- Optional free-text **note** for detail  
- MVP enum: `chart` | `lyrics` | `backing` | `click` | `stem` | `instrumental` | `reference` | `other`  
- Extensibility: product adds enum values later; `other` + note is the escape hatch  

### Q18 — Duplicate Arrangements in one Setlist → **ACCEPTED: ALLOW**

- Same Arrangement may appear multiple times (reprise/encore/repeat)  
- Identity is **SetlistItem** / **EventSetlistItem**, never unique(ArrangementId) per setlist  

### Q19 — Setlist ↔ Event → **ACCEPTED: copy-on-apply (hybrid)**

| Concept | Role |
| ------- | ---- |
| **Setlist** | Reusable Group **template**; editable; may exist with no Event |
| **Event setlist items** | **Event-owned** ordered items (`EventSetlistItem`): ArrangementId + order + overrides |

- Applying a template to an Event **copies** items into the Event (not a live FK to the template)  
- Optional `sourceSetlistId` on Event is **provenance only**, not a live join  
- Later template edits do **not** rewrite past/future Events already copied  
- No Arrangement content versioning in MVP  

### Q20 — Event type → **ACCEPTED**

Strict enum: `rehearsal` | `performance` | `other`  
- `recording_session`, `audition`: use `other` + notes (**DEFERRED** as first-class types)  
- `service`: **OUT OF SCOPE** as a core type (ADR-0001); use `performance` or `other`  

Also: Event lifecycle status `scheduled` | `cancelled` (**ACCEPTED**).

### Q21 — Duration / transitions → **FUTURE**

Not on SetlistItem/EventSetlistItem in MVP.

### Q22 — Arrangement status → **FUTURE**

No draft/ready/archived state machine in MVP. No setlist eligibility gating by status. Soft-delete covers removal from active use.

### Historical semantics (cross-cutting) → **ACCEPTED**

When opening an Event from months ago, the user must see:

| Stable (frozen on Event) | Not frozen in MVP |
| ------------------------ | ----------------- |
| Event time, type, status, notes, location | Arrangement lyrics/chords body |
| EventSetlistItem order, ArrangementId, overrides (key/BPM/capo/notes) | Resource file bytes / link targets as they change |
| Attendance/RSVP records | Song title renames in **live library** (acceptable) |

**Phase 1.3 / ADR-0018:** Event plan lines use **copied** `displaySongTitle` + `displayArrangementLabel` (identity only). Soft-deleted Arrangement/Song → tombstone from those copies; do not drop rows.  
**Supersedes** “show current title” for **Event history** display.

### Delete / archive semantics → **ACCEPTED**

| Entity | MVP semantics |
| ------ | ------------- |
| Group | Soft-delete (ADR-0013) |
| Song | Soft-delete; Arrangements/Resources inaccessible with it |
| Arrangement | Soft-delete; Event items remain with tombstone (**last-Arrangement block superseded by ADR-0017 ALLOW zero**) |
| Resource | Hard-delete record (blob GC later); does not rewrite Event history |
| Setlist (template) | Hard-delete allowed (Events already hold copies); null `sourceSetlistId` (ADR-0017) |
| Event | Prefer `cancelled` + soft-hide; do not hard-delete as default past-Event action |
| EventSetlistItem | Hard-delete only while editing a non-historical draft Event; once Event is in the past, prefer leave items + cancel Event |

No universal soft-delete framework required — per-entity rules above.

### Canonical MVP workflow

1. User registers / signs in  
2. Owner creates Group  
3. Owner invites Member (Member joins)  
4. Owner creates Song (Arrangement optional — ADR-0025; may create initial Arrangement in same product flow)  
5. Owner attaches ≥1 Resource  
6. Owner creates Setlist template; adds Arrangement item(s) (duplicates allowed)  
7. Owner creates Event (`rehearsal` or `performance`)  
8. Owner applies Setlist template to Event (copy) or builds Event items directly  
9. Member views Arrangement materials + Event  
10. Member RSVPs  

This is the minimum loop that is more than song CRUD.

### Still OPEN / DEFERRED (not blockers for domain shape)

| ID | Status |
| -- | ------ |
| Q8 chart format | OPEN |
| Q9 realtime | OPEN (lean no) |
| Q10 billing | OPEN |
| Q11 mobile/PWA | OPEN |
| Account-deletion product | OPEN |
| Invite mechanics (email vs link) | DEFERRED to security/product UX |
| CSRF / hosting | Implementation design |

### Consequences

**ACCEPTED:** Event model uses **EventSetlistItem** copies; live `Event.SetlistId` join is **rejected**. Binding with ADR-0017/0018 refinements.

---

## ADR-0015 — MVP domain specification clarifications (Phase 1.0)

- **Status:** **ACCEPTED**  
- **Accepted:** 2026-09-15 (Phase 1 closure — **HUMAN-APPROVED**)  
- **Date:** 2026-09-15  
- **Depends on:** ADR-0005–0008, 0012–0014  
- **Does not supersede** those ADRs; sharpens MVP behavior. Later Phase 1 ADRs 0016–0018 refine specific items (see reading order).

### Context

Phase 1.0 challenged product boundaries and Song/Arrangement/Setlist/Event/AuthZ before scaffold. Several rules were implied but not explicit enough to prevent agent invention.

### Proposed decisions

1. **Backbone:** Library-first **Song → Arrangement → Setlist → Event** remains the conceptual spine (Events support prep/delivery; they do not own musical truth).  
2. **Setlist independence:** Setlist is Group-scoped and may exist without an Event. *(Event association: **copy-on-apply** into Event-owned items — ADR-0016; not a live Setlist FK.)*  
3. **No cross-tenant repertoire links:** SetlistItem and Event must not reference Arrangements/Setlists from another Group.  
4. **Arrangement immutability of lineage:** An Arrangement cannot move to another Song or Group after create.  
5. **Last Arrangement:** ~~rejected~~ → **ALLOW zero Arrangements** (ADR-0017). ~~Create Song still creates Default Arrangement (assumption).~~ → **ADR-0025 ACCEPTED:** Song create does not require Arrangement.  
6. **SetlistItem overrides (MVP floor):** order plus optional key, BPM, capo, notes. Duration/transitions FUTURE (ADR-0016).  
7. **Resource purpose:** Strict enum — **six values in ADR-0017** (revises earlier open/exact list).  
8. **Event type:** `rehearsal` \| `performance` \| `other` (ADR-0016/0017).  
9. **Membership:** First-class domain association.  
10. **Historical identity:** Copied display labels on EventSetlistItem (ADR-0018) — identity tombstones, not content snapshots.

### Explicitly still OPEN (do not invent in code)

Q8 chart format · account-deletion product flow  

**Superseded as OPEN / revised by later Phase 1 ADRs:** Q17–Q22, Setlist↔Event, last-Arrangement, Event history labels (see 0016–0018).

### Reading order on conflicts (all ACCEPTED Phase 1)

**ADR-0018 > 0017 > 0016 > 0015**

### Consequences

DOMAIN-MODEL / CONTEXT Phase 1 sections are **binding FACT**. Do not reopen without a superseding ADR.

### Rejected in this ADR (scope)

Member musical content mutation · Event resources · Organization · Recording/Performance aggregates · polymorphic asset platform · generic PM/chat/social/DAW/distribution

---

## ADR-0014 — Arrangement aggregate boundary

- **Status:** ACCEPTED  
- **Accepted:** 2026-09-15 (Phase 0.5)  
- **Depends on:** ADR-0007, ADR-0008

### Decision

- **Arrangement is its own aggregate root** with its own identity  
- Arrangement references **SongId** and **GroupId** (tenant isolation)  
- Arrangement owns mutable musical data and its **Resources**  
- **SetlistItem** references **ArrangementId**  
- Arrangement mutations do **not** require loading Song into the aggregate  
- Cross-aggregate invariants (e.g. ≥1 arrangement, exactly one default) are enforced at the **application / domain-service** boundary  
- Related mutations use an **explicit transaction** where required  

### Core Arrangement data (subject to chart-format OPEN Q8)

- lyrics, chords, structure, default key, default BPM  
- label / isDefault as needed  

### Aggregate clarification (binding)

| Concept | Meaning |
| ------- | ------- |
| **Song** | Musical work / identity / attribution |
| **Arrangement** | Group-owned realization of that work |
| **Setlist** | References Arrangements via SetlistItems |
| **Resource** | Belongs to Arrangement in MVP |
| **Event** | Occurrence/context (e.g. rehearsal/performance); **not** a replacement for Arrangement |

### Out of MVP

- Recording / Performance aggregates  
- Extra aggregates for every musical nuance  

### Rejected

Arrangement as child entity inside Song aggregate only.

### Consequences

EF: Arrangements table with FKs; own concurrency. APIs may nest create under songs; updates by ArrangementId.

---

## ADR-0013 — Group ownership & lifecycle

- **Status:** ACCEPTED  
- **Accepted:** 2026-09-15 (Phase 0.5)  
- **Depends on:** ADR-0005, ADR-0012

### Decision

| Rule | Binding |
| ---- | ------- |
| Multiple Owners | **Yes** |
| Zero Owners while Group exists | **Forbidden** |
| Last Owner leave | **Blocked** |
| Last Owner remove/demote self | **Blocked** |
| Transfer ownership | **Yes** — explicitly grant Owner role |
| Owner remove another Owner | **Yes** only if ≥1 Owner remains |
| Member leave voluntarily | **Yes** |
| Owner remove Member | **Yes** |
| Empty Group (zero memberships) | **Forbidden** |
| Owners-only Group | **Allowed** |
| Group deletion | **Allowed**; prefer **soft delete** |
| After soft delete | Group hidden; Songs, Arrangements, Setlists, Events, Resources **inaccessible** via normal tenant access |
| Object-storage GC | **Future** operational concern |
| Account-deletion product | **Not designed** in this ADR (sole-owner constraint still applies as domain intent when that flow exists) |

### Rejected

Single-owner-only model; hard-delete-only as MVP default.

---

## ADR-0012 — Roles & authorization

- **Status:** ACCEPTED  
- **Accepted:** 2026-09-15 (Phase 0.5)  
- **Depends on:** ADR-0005, ADR-0006

### Decision

MVP roles are exactly:

- **Owner**
- **Member**

**Do not** create an Organizer role.

| Persona | Typical role |
| ------- | ------------ |
| Group Organizer | Owner |
| Member | Member |

Authorization is **role-based only** for MVP.

### Distinctions (binding)

| Concern | Meaning |
| ------- | ------- |
| **Authentication** | Who is the User? (Identity — ADR-0009) |
| **Authorization** | What may this membership do in a Group? (this ADR) |
| **Tenant isolation** | GroupId scoping (ADR-0005) |
| **Domain ownership** | e.g. Resource → Arrangement → Group — not user-owned files in MVP |

### Permission matrix

| Action | Owner | Member |
| ------ | ----- | ------ |
| View songs / arrangements / resources / setlists / events | Y | Y |
| RSVP (where applicable) | Y | Y |
| Manage membership / invite / remove | Y | N |
| Modify Group settings | Y | N |
| Create/update/delete Songs | Y | N |
| Create/update/delete Arrangements | Y | N |
| Create/update/delete Resources | Y | N |
| Create/update/delete Setlists | Y | N |
| Manage Events | Y | N |
| Transfer ownership | Y | N |
| Delete Group | Y | N |
| Leave Group | Y* | Y |

\*Owner leave only if not the last Owner (ADR-0013).

**Member cannot mutate core Group content in MVP.**

### Forbidden in MVP

Per-resource ACL · granular permission entities · permission tables · policy engines · complex RBAC abstractions · `guest` role · separate `organizer` role

### Rejected

Three-role `owner|organizer|member` for MVP (defer until needed).

---

## ADR-0011 — Session strategy

- **Status:** ACCEPTED  
- **Accepted:** 2026-09-15 (Phase 0.5)  
- **Depends on:** ADR-0009, ADR-0010

### Decision

- Secure **HTTP-only** ASP.NET Core Identity **application cookie** for the **web MVP**  
- **Same-site** SPA + API deployment (API remains a first-class boundary; browser authenticates via cookie)  
- **Vite dev proxy** for local development  
- **HttpOnly** cookies; **Secure** in production  
- **SameSite** appropriate to same-site deployment  
- **Explicit CSRF** strategy must be defined during implementation / security design  
- **Server-side logout**  
- **Do not** use JWT access + refresh for the web MVP  
- **Do not** introduce a separate BFF architectural layer  
- Future mobile/native **bearer** auth is an **additive future ADR**  

### Clarification

This does **not** mean “Sonivo has no API.” The ASP.NET Core API is first-class; the browser authenticates to it with the application cookie.

### Rejected

BFF-as-layer for MVP · JWT+refresh as web MVP auth · dual cookie+JWT for web MVP

---

## ADR-0010 — Technology stack

- **Status:** ACCEPTED  
- **Accepted:** 2026-09-15 (Phase 0.3)  
- **Supersedes:** Phase 0 assumption “TypeScript across the stack”

### Decision

Minimum sufficient stack for Sonivo SaaS:

| Layer | Choice |
| ----- | ------ |
| Frontend (product app) | React + TypeScript + Vite + Tailwind CSS |
| Backend | ASP.NET Core modular monolith |
| Persistence access | Entity Framework Core |
| Database | PostgreSQL (managed) |
| Object storage | S3-compatible **or** Azure Blob–style via abstraction |
| Auth platform | ASP.NET Core Identity (see ADR-0009) — **not** Supabase-as-platform |

### Architectural principles (binding)

- Modular monolith (ADR-0003)  
- No microservices, event sourcing, or CQRS unless a future ACCEPTED ADR justifies them  
- Do **not** introduce Next.js merely for SSR/SEO of the authenticated app  
- Marketing-site rendering strategy, if needed later, is a **separate** concern/ADR  
- Do **not** make Supabase the application platform by default  

### Rejected alternatives

| Rejected | Why |
| -------- | --- |
| Next.js as product shell with .NET API | Extra complexity without MVP need |
| Next.js full-stack replacing .NET | Rejects intentional .NET domain host |
| Blazor primary UI | React + design-skill ecosystem preferred for this product UI |
| Supabase-as-platform (Auth+DB+Storage as app core) | Conflicts with Identity + portable storage abstraction |
| Microservices / ES / CQRS | Premature |

### Consequences

Dual toolchain (Node for SPA + .NET API). OpenAPI contract is critical. Hosting provider still OPEN.

---

## ADR-0009 — Authentication

- **Status:** ACCEPTED  
- **Accepted:** 2026-09-15 (Phase 0.3)  
- **Condition:** Valid with ADR-0010 (.NET stack)

### Decision

- **ASP.NET Core Identity** is the **single** authentication system for MVP  
- Initial mechanism: **email/password**  
- Include **email verification** and **password reset**  
- External/social providers may be added **later** only via Identity external authentication  
- **Do not** use Supabase Auth  
- **Do not** use Clerk + Identity or any dual-IdP hybrid  
- **Authorization** (Group roles/permissions) remains an application/domain concern  

### Session (resolved)

- **ADR-0011 ACCEPTED:** HTTP-only Identity application cookie; same-site SPA+API; CSRF to be defined at implementation/security design.  

### Related ACCEPTED

- Roles: ADR-0012 · Group lifecycle: ADR-0013

### Rejected alternatives

| Rejected | Why |
| -------- | --- |
| Supabase Auth | Wrong platform coupling with ACCEPTED stack |
| External OIDC-only (Clerk/Auth0) as sole MVP IdP | Extra vendor; Identity sufficient for email/password MVP |
| Identity **and** separate OIDC product in parallel | Two sources of truth |

### Consequences

AuthN implemented in ASP.NET; App User mapped to domain User; invites/membership are AuthZ, not a second IdP.

---

## ADR-0008 — Resources

- **Status:** ACCEPTED  
- **Accepted:** 2026-09-15 (Phase 0.3)

### Decision

- MVP **Resource belongs to Arrangement** only  
- Resource kinds: **`file`** | **`external link`**  
- **Purpose** is metadata/label (e.g. backing, click, stem, chart, reference) — **not** separate domain entity types  
- No specialized resource subclasses/tables per media type in MVP  
- No generic polymorphic attachment infrastructure in MVP  
- **Event resources are FUTURE** and must remain **additive**  

### Out of MVP (intentional)

- Resources on Song, Event, Project, Recording, Performance  
- Stem-mixer domain objects  
- Per-type resource aggregates  

### Rejected alternatives

| Rejected | Why |
| -------- | --- |
| Polymorphic Arrangement\|Event parents in MVP | Premature abstraction |
| Song-only files | Breaks multi-arrangement audio/charts |
| Entity-per-purpose (BackingTrack, ClickTrack, …) | Type explosion |

### Consequences

Requires Arrangement existence (ADR-0007). AuthZ via Arrangement → Song → Group.

---

## ADR-0007 — Song and Arrangement

- **Status:** ACCEPTED  
- **Accepted:** 2026-09-15 (Phase 0.3)

### Decision

- **Song** = musical work identity / attribution (title, original vs cover, etc.)  
- **Arrangement** = group/project-specific musical realization  
- **Arrangement owns:** lyrics, chords, structure, default key, default BPM  
- ~~Creating a Song creates a **Default Arrangement**~~ → **REVISED by ADR-0025 ACCEPTED:** Song create does **not** require an Arrangement; zero Arrangements ALLOWED (ADR-0017). Convenience “Song + initial Arrangement” may exist as an Application use-case only.  
- **SetlistItem** references an **Arrangement**  
- **SetlistItem** may hold execution-specific overrides (e.g. one-off key) where appropriate  
- UI may progressively disclose Arrangement when only one exists (**count-based**; no `IsDefault` — ADR-0025)  

### Intentional OUT OF MVP (do not invent as aggregates)

| Concept | MVP treatment |
| ------- | ------------- |
| **Recording** (release artifact) | Not an aggregate — use audio **Resource** on Arrangement if needed |
| **Performance** (as work entity) | Not an aggregate — use **Event** with type `performance` |
| Album / EP / release Project | FUTURE |
| Every transpose as new Arrangement | Prefer SetlistItem override for one-offs; new Arrangement only for lasting divergence |

### Keep distinct

Song ≠ Arrangement ≠ Setlist ≠ Event.

### Rejected alternatives

| Rejected | Why |
| -------- | --- |
| Flat Song only | Costly migration when lasting multi-version charts/audio appear |
| Setlist → Song only | Ambiguous which charts/audio apply |
| Recording/Performance aggregates in MVP | Premature |

### Aggregate boundary (resolved)

- **ADR-0014 ACCEPTED:** Arrangement is a separate aggregate root.

### Still OPEN

- **Q8:** Chart format (text / ChordPro / PDF / hybrid) — remain OPEN

### Consequences

Domain and APIs must not collapse Arrangement into Song. Resources hang off Arrangement (0008).

---

## ADR-0006 — Primary persona

- **Status:** ACCEPTED  
- **Accepted:** 2026-09-15 (Phase 0.3)

### Decision

- **Primary persona:** Group Organizer (acquisition, IA, admin, content creation)  
- **Secondary persona:** Member  
- **Guest:** provisional — **not** a required full MVP capability  
- Member **read/use** experience must be **first-class** (retention); do **not** design Sonivo as an admin dashboard where musicians are an afterthought  

### Rejected alternatives

| Rejected | Why |
| -------- | --- |
| Member-first product | Empty libraries; weak paid/admin loop |
| Worship-leader-only framing | Violates ADR-0001 positioning |
| Guest-required MVP | Scope expansion without validation |

### Consequences

Empty states and permissions design optimize Organizer activation; rehearsal-time paths optimize Member speed-to-chart/audio.

---

## ADR-0005 — User → Group tenancy

- **Status:** ACCEPTED  
- **Accepted:** 2026-09-15 (Phase 0.3)

### Decision

- A **User** may belong to **multiple Groups**  
- **Group** is the MVP **tenant / data-isolation** boundary  
- **Membership** is scoped to Group  
- **Invitations** are scoped to Group  
- **Do not** introduce **Workspace** or **Organization** in MVP  
- Preserve a **future** migration path toward Organization **without designing** Organization now (e.g. later nullable parent FK while Group remains isolation boundary)  

### Ownership lifecycle (resolved)

- **ADR-0013 ACCEPTED** (multi-owner, last-owner rules, soft-delete).  
- **ADR-0012 ACCEPTED** (Owner | Member roles).

### Still OPEN

- Full account-deletion product flow (not designed; sole-owner constraint is domain intent)

### Rejected alternatives

| Rejected | Why |
| -------- | --- |
| Workspace → Group nesting in MVP | Extra noun; little MVP value |
| Organization → Group in MVP | Theoretical scalability only |
| Single-group-only users | Unrealistic for working musicians |

### Consequences

All tenant data keyed by `GroupId`; storage prefixes under group; AuthZ is membership-in-group. Prefer term **Group** over Workspace in product language.

---

## ADR-0004 — Documentation information architecture

- **Status:** ACCEPTED  
- **Date:** 2026-09-15  

Root `README.md` + `AGENTS.md`; docs under `docs/00-context` … `03-architecture` + `tooling`. Defer empty `04-design` / `05-security` / `06-development`.

---

## ADR-0003 — Modular monolith

- **Status:** ACCEPTED (directional)  
- **Date:** 2026-09-15  

Single deployable backend with domain modules; Postgres SoR; object storage for files. No microservices/CQRS/event sourcing without a future ADR.

---

## ADR-0002 — Process tooling preference

- **Status:** **ACCEPTED**  
- **Date:** 2026-09-15  
- **Accepted in:** Phase 0.8 (tooling prune & ratification)

**Policy (binding):**

- **CORE (project-local):** `grill-with-docs`, `domain-modeling`, `to-spec`, `to-tickets`, `tdd`, `implement`, `code-review`, `diagnosing-bugs`, `codebase-design`
- **SPECIALIZED (project-local; task-gated):** `impeccable`, `grilling`, `prototype`, `research`, `resolving-merge-conflicts`
- **DEFERRED:** `setup-matt-pocock-skills`, `handoff`, `product-marketing`, Context7, surplus Matt skills — do not install/configure/invoke/depend
- **REJECTED:** `wayfinder`, `git-guardrails-claude-code`, `migrate-to-shoehorn`, `scaffold-exercises`
- **Removed from project-local (0.8):** surplus Matt skills, `product-marketing`, Graphify project rule + `graphify-out/`, watermarks project rule
- **Not Sonivo deps:** user-global Taste/Emil; user-global Graphify CLI; Context7; watermarks-remover global install/service

Skills support repository process (`docs/`, ADRs, TDD); they do not replace it.

---

## ADR-0001 — Multi-segment positioning

- **Status:** ACCEPTED  
- **Date:** 2026-09-15  

Sonivo is not church-first; worship is a supported segment. Core language stays generic (`Event`, not `Service` as core type).

---

## Index

| ADR | Title | Status |
| --- | ----- | ------ |
| 0001 | Positioning | ACCEPTED |
| 0002 | Process tooling | **ACCEPTED** |
| 0003 | Modular monolith | ACCEPTED |
| 0004 | Docs IA | ACCEPTED |
| 0005 | Group tenancy | **ACCEPTED** |
| 0006 | Primary persona | **ACCEPTED** |
| 0007 | Song/Arrangement | **ACCEPTED** |
| 0008 | Resources | **ACCEPTED** |
| 0009 | Authentication | **ACCEPTED** |
| 0010 | Stack | **ACCEPTED** |
| 0011 | Session strategy | **ACCEPTED** |
| 0012 | Roles / AuthZ | **ACCEPTED** |
| 0013 | Ownership lifecycle | **ACCEPTED** |
| 0014 | Arrangement aggregate | **ACCEPTED** |
| 0015 | MVP domain spec clarifications | **ACCEPTED** |
| 0016 | Phase 1.1 edge cases (Q17–Q22, history) | **ACCEPTED** |
| 0017 | Phase 1.2 spine/resources/history revisions | **ACCEPTED** |
| 0018 | Historical Event identity (tombstones) | **ACCEPTED** |
| 0019 | Group tenancy enforcement | **ACCEPTED** |
| 0020 | CSRF + cookie posture (SPA) | **ACCEPTED** |
| 0021 | Replace Event Plan from Setlist | **ACCEPTED** |
| 0022 | Cross-Group referential integrity (persistence) | **ACCEPTED** |
| 0023 | Soft-delete filters vs Event history | **ACCEPTED** |
