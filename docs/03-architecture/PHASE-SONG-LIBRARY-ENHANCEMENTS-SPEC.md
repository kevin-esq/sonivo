# Song library enhancements

**Status:** User-authorized implementation scope, 2026-10-22. This additive spec does not reopen unrelated Phase 3.2 work.
**Authority:** ADR-0055 W-B (tags and per-user favorites), ADR-0079 (Group tenancy), ADR-0080/0082 (resource-level reads), ADR-0020 (cookie + antiforgery).

## Scope

Complete the existing Songs library with three additive capabilities:

1. Search songs by title, attribution, and tags.
2. Toggle the current user's favorite state on an accessible Song.
3. Server-side pagination with stable sorting and a response total.

Keep existing Song, Arrangement, and Resource boundaries. Search, ordering, paging and favorite selection must occur after Group membership and per-Song visibility have been enforced. A caller must never infer inaccessible Song counts from paginated results.

## API contract

`GET /api/groups/{groupId}/songs` accepts optional `q`, `tag`, `favoritesOnly`, `sort`, `page`, and `pageSize`; defaults are empty query, no tag, false, `title`, 1, and 25. `pageSize` is 1–100. A `tag` is one normalized tag (up to 32 characters). Supported sort keys: `title`, `artist`, `recent`, `updated`, and `theme`. Responses are `{ items, totalCount, page, pageSize, totalPages, availableTags }`; ties use Song ID for stable order. Search is trimmed, case-insensitive substring matching across title, attribution, and tags. Favorite filtering is scoped to the authenticated user. Requests without any query parameters retain the legacy array response for existing clients; parameterized requests use the paged contract.

`PUT /api/groups/{groupId}/songs/{songId}/favorite` and `DELETE .../favorite` are idempotent. Both require an authenticated group member with read access to that exact Song, and writes require antiforgery. A SongFavorite is unique by `(GroupId, SongId, UserId)` and is not part of the Song version.

## UI contract

Keep the existing visual identity and filters. Add attribution/tag search to the existing search field. Add an accessible favorite control on each Song card and keep the Favorites filter functional. Page navigation exposes the current page, total pages, and total visible Songs, supports an empty result state, and resets to page one when query, filter, or sort changes. Localize all new UI text in es/en/pt. No bulk actions, new roles, or other repertoire features.

## Tickets and validation

- **T-SL-01:** validated paged list query and query filters in the application/persistence layer.
- **T-SL-02:** per-user SongFavorite persistence, migration, and idempotent authorized API operations.
- **T-SL-03:** localized library search, favorite controls, pagination, keyboard/screen-reader and responsive behavior.

Validate server-side filtering and stable paging, Group/Song visibility isolation, favorite idempotence and per-user isolation, request validation, TypeScript, .NET tests, and desktop/mobile browser flows. Do not apply migrations to staging or production. Do not commit, push, or open a PR without separate authorization.
