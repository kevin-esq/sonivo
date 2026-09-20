# Phase Practice extras thin (ADR-0037)

**Status:** **PROPOSED** 2026-09-20 — awaiting Kevin ACCEPTANCE + in/out confirmation. Nothing below binds implementation.
**Product bet (proposed):** Practice helps musicians get in tune (client tuner) and watch the linked reference (embed) — without scoring promises Sonivo cannot keep.
**Date:** 2026-09-20
**Depends on:** ADR-0037 (PROPOSED), 0024, 0027, 0028, 0029, 0030, 0031; T-3.2.06.

---

## Mechanics (proposed — binding only after ACCEPTANCE; open items are questions for Kevin, not decisions)

| ID | Sketch (open items are questions for Kevin, not decisions) |
| -- | ----------------------------------------------------------- |
| Q-FX-1 | Tuner (IN proposed): client-only chromatic tuner — YIN/autocorrelation in an AudioWorklet, mic-gated (active only while the “Afinador” is open), no deps, no server, no recording, no persistence. Reports heard pitch only. |
| Q-FX-2 | Tuner non-goal: per-note feedback — no reference melody exists in Sonivo, so verse-level “you sang flat” scoring would mislead. Tuner never scores. |
| Q-FX-3 | YouTube embed (CONDITIONAL IN proposed): `youtube-nocookie` iframe for link Resources with `purpose=reference`; no Data API, no keys. CSP `frame-src` + `img-src` additions for the nocookie host/thumbnails. |
| Q-FX-4 | YouTube constraint (explicit): NO follow-along sync on YouTube — cross-origin iframe exposes no `timeupdate`; sync stays file-audio-only per ADR-0031. Non-goals: IFrame API control, search, extraction. |
| Q-FX-5 | Scoring (OUT proposed): karaoke scoring stays OUT — reference-free scores mislead without melody ground truth; game value < confusion risk. May reopen with reference tracks via a future ADR. |
| Q-FX-6 | Testability: tuner pitch math unit-coverable without mic (synthetic fixtures); embed asserts render/CSP mechanics with a fixture link; no vendor calls in tests. E2E asserts mechanics, not pitch accuracy. |
| Q-FX-7 | Spanish UI (“Afinador”, “Ver referencia”, mic-gate notice — exact copy at ACCEPTANCE). |
| Q-FX-8 | **OUT (firewall):** server pitch detection, audio recording, per-note feedback, IFrame API control, YouTube search/extraction, sync on YouTube, scoring, Whisper, cloud LLM, Q9, S3, 5 MiB raise, MusicXML, Event/RSVP mail. |

---

## Scope

| In (thin, after ACCEPTANCE) | Out |
| --------------------------- | --- |
| Client-only tuner UX, Spanish (TC-PITCH-01 sketch) | Per-note feedback / scoring of takes |
| Reference iframe embed + CSP additions (TC-YT-01 sketch) | IFrame API control / search / extraction / sync on YouTube |
| Scoring explicitly OUT (TC-KAR-01 name reserved) | Any scoring UX or reference-track modeling |

---

## Tickets (gated on ACCEPTANCE + Kevin in/out confirmation — do NOT start before Kevin ACCEPTS ADR-0037)

| ID | Work | Status |
| -- | ---- | ------ |
| **T-FX-00** | Docs: ADR-0037 PROPOSED + this spec skeleton | IN PROGRESS (this branch, docs only) |
| **TC-PITCH-01** | (sketch) Tuner: mic-gated Afinador UX + pitch-math tests + sparse Playwright mechanics | GATED — needs ACCEPTANCE + in-confirm |
| **TC-YT-01** | (sketch) Reference embed: nocookie iframe + CSP + sparse Playwright mechanics | GATED — needs ACCEPTANCE + in-confirm |
| **TC-KAR-01** | (name reserved) Scoring — OUT; no work authorized | RESERVED — explicitly OUT |

Implementation branch naming: `feature/t-fx-*` (one coherent vertical slice per ticket or batched only with explicit approval).

---

## API / persistence notes (proposed, binding only after ACCEPTANCE)

- No migration in thin: tuner is client state only; embed reuses existing link Resources (`purpose=reference`).
- No new endpoints in thin (proposed); CSP change is config, not schema.
- No new dependencies (tuner is hand-rolled YIN/autocorrelation in the SPA); no keys/secrets.

---

## Audit checklist (each implementation PR, after ACCEPTANCE)

- [ ] No server pitch detection / recording / per-note feedback
- [ ] No YouTube Data API / keys / search / extraction / IFrame control
- [ ] No follow-along sync on YouTube (file-audio-only sync unchanged)
- [ ] No scoring UX of any kind
- [ ] CSP additions minimal (nocookie host/thumbnails only)
- [ ] Spanish copy
- [ ] Named Playwright TCs when ticket sketches ship + suite green
- [ ] No Cursor co-author trailers
