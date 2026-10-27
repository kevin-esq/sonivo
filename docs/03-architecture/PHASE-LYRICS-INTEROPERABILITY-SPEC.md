# Rich lyric interoperability

**Status:** ACCEPTED scope, owner-authorized 2026-10-21; implementation tracked in `.scratch/NOW.md`.
**Decision:** ADR-0100 amends ADR-0050/0096; ADR-0101 adds Sonivo-owned interchange/export. All other Practice boundaries remain binding.

## Tickets

- T-LYRICS-01: import Apple TTML through file/paste preview; preserve paragraphs, Unicode, absolute clock times and end times. Invalid XML/DTD and unsupported timing fail safely. Report discarded metadata explicitly.
- T-LYRICS-02: import true TTML span and Enhanced LRC word timing without invented intervals. Keep LRC encodings, offsets, repeat marks and limits. Clip negative shifted intervals consistently and discard wholly pre-zero intervals with a warning.
- T-LYRICS-03: additive line ends and overlapping vocal lines in server validation and Stage. Words on one line cannot overlap; instrumentals cannot overlap vocals. Keep legacy line-only behavior.
- T-LYRICS-04: refine existing Stage with concurrent word fill and bounded audio-clock work, preserving reduced motion, seeking and validated same-browser output.
- T-LYRICS-05: Owner-triggered LRCLIB lookup by title/artist/optional album/duration. Fixed HTTPS endpoint, bounded response/time, review/apply only. No automatic writes or unsupported proxy integrations.
- T-LYRICS-06 (ADR-0101): own Sonivo TTML v1 adapter and lossless source/timeline round-trip; recognized provider JSON plus plain/ChordPro import; native TTML, classic LRC, ChordPro and print/Save as PDF exports. No provider-specific persistence. The printed/PDF output is static text, not timed playback.

## Accepted test seams

Owner-approved import preview → versioned apply → Arrangement retrieval and Stage playback. Application tests cover parser/converter and timeline validation; API tests cover real auth, preview/apply and lookup with a deterministic HTTP transport; Playwright covers real React/API import/apply and Stage without replacing the API. Use short original lyrics in test fixtures.

## Compatibility

The existing `Features:Lrc` switch controls import, lookup and lyric document exports. Routes remain English. The import route retains `import-lrc` for existing clients. New preview format/precision diagnostics are additive. The optional line `endMs` is additive; older clients can still consume `atMs`. TTML is a supported lyric subset, not arbitrary TTML animation/layout. Missing word timing never causes fabricated karaoke timing. Classic LRC export remains line-level with an explicit UI label; native TTML retains the normalized Sonivo source/timeline, while ChordPro and printed/PDF output retain the text/chart.

Native TTML v1 declares `sonivo:version="1"` in `https://sonivo.lat/ns/lyrics/1`. Its TTML metadata contains `sonivo:source` (the primary Arrangement body) and `sonivo:timeline` (the validated timing array); the standard TTML body projects the visible lines and timed spans for other readers. Existing Arrangement storage remains authoritative, so there is no second persisted XML or provider payload to drift. Import normalizes blank edge lines before preview and remaps indexes to the body that Arrangement persistence will save. Applying a new lyric document explicitly replaces the lyric and synced ChordPro bodies after review.

Provider adapters accept supported TTML/LRC/Enhanced LRC/plain/ChordPro and recognized JSON shapes, including wrapped lyric strings and line arrays with explicit millisecond timestamps. This is interchange compatibility, not a claim of direct catalog access to every vendor. Only LRCLIB lookup is connected. External credits, translations, vocal-agent names and unsupported layout metadata are not persisted; the preview reports omitted metadata. Overlapping paragraph and Apple `x-bg` vocals remain separate timed lyric lines.

TTML pasted directly into an Arrangement lyrics/chords edit is normalized through the same bounded parser on save, including its timing, so raw XML cannot enter new Practice playback. For legacy Arrangements containing valid raw TTML, authorized detail reads project the converted lyrics and timeline without mutating stored data or its version. Malformed legacy content remains available to an Owner for repair through the importer.

The TTML reader accepts a structurally valid `tt` root and matching body/paragraph namespace even when an imported document declares a nonstandard namespace (observed legacy `http://w3.org`). The Sonivo native profile still requires its exact namespace and version. XML entity and timing validation remain unchanged.

## Delivery evidence

Local validation on 2026-10-21: 853 .NET Release tests passed, 6 targeted Playwright tests passed with 1 feature-off case skipped, TypeScript passed, and the optimized frontend static build succeeded. Browser journeys exercised the real cookie/API/PostgreSQL flow and desktop/mobile/reduced-motion presentation. Existing pruning/static-export warnings remain. Native mobile parity and remote deployment are outside this delivered web slice; Git/approval state remains in `.scratch/NOW.md`.
