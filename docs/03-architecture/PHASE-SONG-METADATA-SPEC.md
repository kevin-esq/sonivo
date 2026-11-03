# Song metadata and Owner-managed tags

**Status:** Authorized by ADR-0110 on 2026-11-02.

## Scope

- Persist optional album and release year on Song.
- Upload, view, replace, and remove a Song cover image through the existing blob store and Group-scoped Song authorization.
- Let the Group Owner define Song tag options in Group settings. Song creation and editing select only those options.
- Preserve current Song tag assignments by backfilling their distinct values into each Group's catalog.
- Show metadata on Song details. Keep Arrangement musical data and Arrangement resources unchanged.

## Contracts

- Album: optional, trimmed, up to 200 characters.
- Release year: optional integer from 1000 through 9999.
- Cover: JPEG/PNG/WebP, at most 2 MiB; validate declared MIME against file signature.
- Group tag catalog: up to 50 normalized tags for new catalogs; 32 characters each. Migration preserves larger legacy catalogs, which Owners can reduce but not grow while above 50. Each Song keeps the existing maximum of 12 tags.
- Reject removal of a tag definition while any live Song in that Group uses it.
- Owner manages definitions; members may read definitions and use them where existing Song permissions allow.

## Delivery checks

- EF migration adds metadata and backfills legacy tags without changing Song assignments.
- API enforces Group membership, per-Song permissions, catalog membership, concurrency, image type, and size.
- Web includes create/edit/detail flows and Group settings management, localized in es/en/pt.
