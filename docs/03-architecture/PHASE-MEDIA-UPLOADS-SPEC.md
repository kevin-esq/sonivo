# Phase — Plan-aware media uploads and image optimization

**Status:** ACCEPTED — owner-authorized 2026-10-19; [ADR-0097](DECISIONS.md#adr-0097--plan-aware-media-uploads-and-image-optimization) binds.
**Delivery:** T-MEDIA-01 only. This is a bounded upload-flow correction, not an audio streaming or billing phase.

## Goal

Let members upload larger audio resources according to the Group plan, reduce oversized image uploads before storage, and keep large-object transfer memory bounded while preserving Group authorization.

## Requirements

1. Resource audio limits are Starter 25 MiB, Pro 100 MiB, and Studio 250 MiB. Other Resource files remain limited to 5 MiB. The server determines the effective plan from the Group selected in the authenticated request.
2. Static PNG, JPEG, and WebP files selected in the shared web upload control are converted to WebP only when they exceed the caller's server-enforced output cap. Preserve transparency and dimensions. Try quality levels from 0.90 down to 0.44; if the file cannot meet the cap at 0.44, reject it without uploading. Branding output cap remains 2 MiB; Resource image cap remains 5 MiB. Animated GIFs retain their existing cap and are not transformed.
3. Apply the same picker behavior to every web surface that can upload an image: Group logo/banner/favicon and Resource image uploads. Keep server-side byte and signature validation authoritative.
4. Keep writes and reads on authenticated API routes with Group authorization. No public or browser-direct R2 access.
5. Stream R2 content to the API caller instead of buffering an entire file in application memory. Advertise byte-range handling only when supported by the stream.
6. Preserve current plan storage-capacity values. This ticket does not enforce aggregate storage quotas because Studio storage is Organization-scoped and the Organization storage accounting model is not implemented.

## Ticket

### T-MEDIA-01 — Plan-aware audio upload and image optimization

Implement the Resource/domain/API cap, localized client behavior, shared image optimization, and streaming R2 content read. Keep the resource MIME allowlist and download authorization unchanged. Do not re-encode audio.

## Verification

- Frontend TypeScript check.
- Backend build.
- Verify code paths mirror plan audio limits and image outputs remain under the existing endpoint byte caps.
- Do not claim end-to-end or provider-backed R2 verification unless performed.

## Deferred

Aggregate Group/Organization quota enforcement · upload reservations and concurrent quota safety · resumable multipart uploads · audio playback renditions · audio transcoding · server-side image decoding · image dimension changes · end-to-end encryption.
