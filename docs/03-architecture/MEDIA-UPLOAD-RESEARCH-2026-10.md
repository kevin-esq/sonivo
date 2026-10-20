# Media upload, storage, and playback research

**Date:** 2026-10-19
**Status:** Research only; no product or architecture decision is made here.

**Outcome (2026-10-19):** The owner accepted [ADR-0097](DECISIONS.md#adr-0097--plan-aware-media-uploads-and-image-optimization) and authorized T-MEDIA-01. The integrated first slice uses plan-aware audio file caps, browser optimization for oversized static PNG/JPEG/WebP files, and streaming R2 reads. Aggregate storage quota enforcement remains deferred until Organization-scoped Studio storage accounting is available.

## Question

How do major music services and Cloudflare preserve audio quality, protect uploads and playback, optimize images, and control storage growth? What does that imply for Sonivo's current 5 MiB upload error?

## Executive findings

- Spotify and Apple Music's consumer catalogs are not a direct model for arbitrary large uploads to a collaboration workspace. Their public documentation describes high-quality source masters and multiple playback quality choices; Spotify says it performs format optimization after delivery. This supports keeping a good source master and generating playback renditions, rather than destructively shrinking a user's only audio file.
- Cloudflare R2 is object storage, not an audio transcoding or music streaming service. It encrypts data at rest with Cloudflare-managed AES-256 keys and uses TLS in transit. R2 can store much larger objects using multipart uploads, but that does not remove Sonivo's API, application authorization, quota, or plan limits.
- Cloudflare Stream is for video. It encodes video to adaptive-bitrate renditions; its additional-audio-track feature attaches audio to an existing video. It should not be assumed to provide a standalone music library or audio streaming pipeline.
- Cloudflare Images can transcode and resize for delivery. When transformations happen only at delivery, the original remains at the origin, so that reduces transfer size but does not reduce Sonivo's stored source bytes. To shrink storage, an upload-time normalization step must write a smaller canonical image (and decide whether the original is retained).
- Sonivo's accepted decisions currently hold the Resource cap at 5 MiB and explicitly defer image re-encoding. Raising the cap, direct-to-R2 uploads, or image normalization therefore need an explicit superseding product/architecture decision before implementation.

## Sonivo as built and accepted

| Surface | Current limit and behavior | Source of truth |
| --- | --- | --- |
| Arrangement Resources (including PDF, images, and audio) | 5 MiB per file. The API buffers a multipart request with a 6 MiB request limit, validates the file, and stores it through `IBlobStore`. Content reads go through the authorized API proxy. | [ADR-0035](DECISIONS.md#adr-0035--cloudflare-r2-s3-compatible-as-alternate-iblobstore-backend-thin); `ResourceFileConstraints` in `src/Sonivo.Domain/Repertoire/Resource.cs`; upload route in `src/Sonivo.Api/Program.cs` |
| Group logo, banner, favicon | 2 MiB each. Server checks size and image signature. ADR-0054 defers image re-encoding. | [ADR-0054](DECISIONS.md#adr-0054--white-label-v2-full-brand-tokens-secondary-colour-and-banner); `BrandLogoConstraints` in `src/Sonivo.Application/Tenancy/BrandingHandlers.cs`; `ReadValidatedBrandingImageAsync` in `src/Sonivo.Api/Program.cs` |
| Create-song audio picker | Client allows up to 100 MiB, then uploads the file as an ordinary audio Resource. The Resource API still rejects files over 5 MiB. This is a real UI/server cap mismatch and explains why a large selected track cannot currently be saved. | `MAX_AUDIO_BYTES` and `submit()` in `web/apps/app/src/groups/dialogs/CreateSongWizard.tsx`; Resource upload route in `src/Sonivo.Api/Program.cs` |
| Shared file selector | `FileDropzone` only selects files and applies the caller-provided size check; it does not compress or transcode them. | `web/apps/app/src/ui/FileDropzone.tsx`; `web/apps/app/src/repertoire/fileUploadErrors.ts` |

The current R2 adapter is the configured blob store. ADR-0035 specifically keeps the server-side authorized read proxy and prohibits public buckets, bare presigned reads, browser-direct PUT, and raising 5 MiB. The accepted white-label decision also prohibits image re-encoding in its v1 scope. Those are binding scope limits, not shortcomings to silently bypass.

## What the platforms document

### Spotify

Spotify's artist delivery guidance prefers FLAC and accepts compliant WAV. It asks providers to supply the highest-quality native stereo master and says Spotify performs format conversions internally; its documented lossless ceiling is 24-bit/44.1 kHz FLAC. Its listener-facing quality varies with plan, device, and connection, from compressed streams to lossless. This is a master-plus-playback-renditions model, not evidence that a user-upload product should discard its source.

Sources: [Audio file formats for Spotify](https://support.spotify.com/mx-en/artists/article/audio-file-formats/), [Spotify audio quality](https://support.spotify.com/us/article/audio-quality/), [Spotify lossless audio quality](https://support.spotify.com/sa-en/article/lossless-audio-quality/).

### Apple Music

Apple documents ALAC lossless catalog versions from 16-bit/44.1 kHz up to 24-bit/192 kHz, with user-selectable streaming/download quality. Apple also cautions that higher resolutions use more network data and device storage. This illustrates that “high quality” requires explicit quality choices and storage/bandwidth tradeoffs; it is not a universal promise of tiny files.

Source: [About lossless audio in Apple Music](https://support.apple.com/en-mide/118295).

### Cloudflare

- **R2:** Object storage with no egress charge, metered storage and operations, a 10 GB-month Standard free allowance, and multipart upload support for large objects (up to 5 TiB/object per the platform limits). Multipart uploads are resumable and retry failed parts. These are infrastructure ceilings, not sensible per-user product quotas.
- **R2 security:** Cloudflare documents automatic AES-256 encryption at rest with Cloudflare-managed keys and TLS for transfers. This is provider-managed server-side encryption. It does not mean Sonivo has end-to-end encryption or that Cloudflare cannot process/serve object data. The application still needs authorization at every read/write. R2 has a customer-provided key example (SSE-C), but adding it to Sonivo would require explicit key lifecycle and recovery design; it is not part of ADR-0035.
- **Images:** Cloudflare Images can resize and output AVIF/WebP/JPEG, choosing a supported efficient format for the viewer. Transformations on existing origin images optimize delivery and can be cached, but do not by themselves replace the source object. Cloudflare Images hosted storage and transformations are separate product capabilities with their own limits and billing.
- **Stream:** Cloudflare Stream handles video upload, encoding, and adaptive-bitrate video delivery. It documents video uploads, H.264 renditions, and signed playback. The separate audio-track endpoint requires an already-uploaded video and caps each audio track at 200 MB. That is not a standalone music streaming offering.

Sources: [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [R2 upload objects](https://developers.cloudflare.com/r2/objects/upload-objects/), [R2 limits](https://developers.cloudflare.com/r2/platform/limits/), [R2 data security](https://developers.cloudflare.com/r2/reference/data-security/), [Cloudflare Images features](https://developers.cloudflare.com/images/optimization/features/), [Cloudflare Images uploaded images](https://developers.cloudflare.com/images/optimization/hosted-images/serve-uploaded-images/), [Cloudflare Stream overview](https://developers.cloudflare.com/stream/), [Stream audio tracks](https://developers.cloudflare.com/stream/edit-videos/adding-additional-audio-tracks/).

## Implications for Sonivo

### Audio

1. Distinguish **upload ceiling**, **per-Group/account storage quota**, **track duration**, **playback format**, and **network bitrate**. Raising the single-file ceiling alone will not control cloud storage growth.
2. For reference tracks and rehearsal audio, accept a bounded source master, store it in R2, and generate one or more playback renditions asynchronously (for example, a high-quality lossy rendition for routine playback, with the source retained for download or future processing). Keep the original if “preserve my song” means faithful retention. Lossless codecs can reduce file size without losing fidelity, but results vary by source; lossy codecs save more at a quality tradeoff.
3. Use duration and file-size constraints by purpose, plus plan-based aggregate storage quotas and clear usage reporting. Select exact numbers only after representative uploads and cost/usage modeling; the current plans spec leaves limits provisional/open.
4. For large uploads, use resumable multipart transfer and verify object size/checksum before making the Resource visible. Direct-to-R2 uploads can avoid proxying large bodies through the API and are a common Cloudflare pattern, but they conflict with Sonivo's accepted no-browser-direct-upload rule. A revised design would need short-lived, object-scoped upload authorization; server-side completion/ownership checks; MIME/signature and size validation; orphan cleanup; and a decision on how the app's existing authorized playback proxy works.
5. Keep playback private and Group-authorized. Encryption at rest and TLS protect storage/transport layers; they do not replace per-request authorization. End-to-end encryption is a different requirement and would complicate server-side transcoding, previews, and range streaming.

### Images

1. Apply a shared **image processing policy** at every image upload surface. The accepted first slice converts oversized static PNG/JPEG/WebP files in the shared web picker, preserving dimensions and transparency; oversized animated GIFs keep their existing cap because flattening them would discard animation. API clients remain bounded by the existing server byte and signature checks.
2. Decide explicitly whether the original is retained. Retaining it preserves fidelity/editability but does not realize storage savings; replacing it with a normalized image saves storage but is destructive. A safer compromise is original plus a small fixed set of generated renditions, with quota accounting against all retained bytes.
3. Set a target by **role and dimensions** (logo, favicon, banner, repertoire image) rather than promising a fixed byte size for every input. Some images cannot meet a very low byte target without visible degradation; fail with an understandable message when the quality floor is reached.
4. Generate small variants for UI cards and previews, and cache delivery variants. This reduces bandwidth and page load even when the source is retained.

### Decision gates

Any implementation should first settle:

- Which uploads are in scope: arrangement audio, general Resources, branding images, or all upload entry points.
- Whether uploaded audio is a reference/practice file or a user-owned master that must remain downloadable without loss.
- File size and duration by purpose, aggregate storage quotas by plan, warning/over-quota behavior, and retention/deletion/cleanup.
- Whether Sonivo accepts provider-managed at-rest encryption (as R2 currently offers) or requires application/customer-key encryption, including recovery and rotation ownership.
- Whether to supersede ADR-0035's 5 MiB and server-proxy-only firewalls and ADR-0054's image re-encoding deferral. A research note itself changes none of them.

## Recommendation before ADR-0097

The accepted first slice resolves the picker/server mismatch and introduces plan-specific audio limits and bounded image optimization. The research recommendation for resumable uploads, aggregate quotas, and audio playback renditions remains future work under the explicit deferrals in ADR-0097.

## Sources

All vendor claims above come from first-party documentation linked inline. Product prices and service limits are time-sensitive and were reviewed on 2026-10-19; re-check them before implementation.
