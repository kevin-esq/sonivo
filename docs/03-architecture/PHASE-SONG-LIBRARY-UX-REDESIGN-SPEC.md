# Phase — Song library UX redesign

**Status:** User-authorized implementation, 2026-10-27.
**Scope:** Incremental UX, interaction, responsive and accessibility improvements to the existing Canciones, Song, Arrangement, Resources and Practice journeys. ADR-0104 authorizes the additive optional Song Genre field; no other domain capabilities are added by this phase.
**Research baseline:** Staging walkthrough and source inspection on 2026-10-27; screenshots are in the task's external Codex visualization folder, not the repository.
**Binding decisions:** ADR-0007/0008/0014/0025 (Song, Arrangement and Resource boundaries; zero or multiple arrangements; no default arrangement), ADR-0020 (cookie/antiforgery), ADR-0055 as amended by ADR-0106 for the list-first Canciones presentation (Song detail tabs remain), ADR-0074 (Group UI primitives and modal creation), ADR-0079/0082/0085 (server-enforced Group/item access), ADR-0089/0092 (canonical routes), ADR-0096/0100/0101 (Practice and lyric boundaries), ADR-0097 (media limits), and ADR-0104 (optional Song Genre).
**Existing adjacent contract:** [`PHASE-SONG-LIBRARY-ENHANCEMENTS-SPEC.md`](PHASE-SONG-LIBRARY-ENHANCEMENTS-SPEC.md) owns search, favorites and pagination contracts. Do not duplicate or broaden those APIs here.

## 1. Goal

Make the existing song repertoire understandable to people with little computer experience while preserving Sonivo's group identity, a compact library, member access to rehearsal material, and all accepted domain/security boundaries. Keep common actions visible, place infrequent actions in clear menus, make edits recoverable, and ensure routes and UI states work at narrow widths and with keyboard/screen readers.

This is an interface and interaction change. It does not add new song, arrangement, resource, practice, provider, permission, or export capabilities.

## 2. Evidence and scope

The 2026-10-27 staging walkthrough covered `/app/groups/{groupId}/library`, Song detail, Arrangement detail/editor, Practice and its tabs, resources, lyric import/export/lookup previews, stage-mode entry/options, song and arrangement creation, and song deletion confirmation. It tested browser back/reload and 320/390/918/1440 CSS-pixel layouts. No write action was submitted. Exact evidence and limitations are recorded in the approved research response in the task history.

Source-level findings include unrendered detail load failures, draft loss on conflicts/close, role-derived UI capability assumptions, keyboard inconsistency between tab sets, serialized Song/Arrangement creation with partial-save recovery, and responsive thresholds. Staging findings include returned-to-library search loss, overlong lyric editor detail, truncated dense table content, confusing empty copy, and mismatched WAV eligibility copy. These are starting evidence, not claims that all users experience the same problem. Validate with novice users before tuning density or adding more guidance.

The selected staging Song and Group were test records. Do not copy their identifiers or personal content into product fixtures, telemetry, screenshots in the repository, or tests.

## 3. Product behavior to preserve

- Song is musical identity; Arrangement is the playable version and owns lyrics, chords, notes and Resources.
- A Song can have zero, one or many Arrangements. Do not create a preferred/default Arrangement or force selection when none exists.
- Keep ADR-0055's Canciones destination, favorites/tags and Song detail tabs/related materials. ADR-0106 amends only the desktop table presentation to the responsive list selected by the owner.
- Existing lyric formats, LRCLIB reviewed lookup, print/export, audio eligibility, Stage and Practice remain bounded by ADR-0096/0100/0101 and feature flags. Do not add providers, automatic lyric application, alignment, scoring, YouTube synchronization, audio transport, or media formats.
- Preserve `/app` canonical routes, static export bridge compatibility, group branding tokens, shared group components, Identity cookies and antiforgery.
- Group membership and effective item permissions are decided on the server on every request. Client capability presentation is a usability hint only.
- Creation flows remain modal-based per ADR-0074. Dirty state may add an explicit discard decision; switching creation to route pages requires a separately accepted ADR amendment.
- Song soft delete remains transactional with its live Arrangements; Resource hard-delete warnings remain proportional and accurate. Do not promise restore/undo unless the server contract supports it.

## 4. Target experience

### 4.1 Canciones library

- One clear page title, a visible primary “Agregar canción” action for authorized users, and a search field. Existing tabs/filters, favorites, tags, sort and pagination remain available without crowding the first viewport.
- Use one compact, readable song list at every width. Keep title and artist together, show genre/tags as supporting information, and retain update date and Arrangement count where space allows. Do not duplicate different desktop/mobile library implementations or create page-level horizontal overflow at 320 CSS px.
- Explain empty library, no search matches and no favorites as different states, with a useful next action only when the user can take it.
- Preserve search, filter, sort and page state through browser back/forward and reload using canonical query parameters where compatible with existing route contracts. Reset pagination when a filter changes.
- Show explicit loading, retryable error and stale-data states. Do not turn load failure into a successful-looking empty library.

### 4.2 Song detail

- Keep identity and the current primary action clear. Preserve the accepted Letra/Acordes/Notas/Archivos tabs and information/related materials.
- Use the broad, consistent label “Versiones” for Arrangements. Explain once that Sonivo calls each version an arreglo; do not frame the product as only for singing. Keep version selection and creation above the Letra/Acordes/Notas/Archivos workspace at every width.
- Make selection of a version visibly control the materials shown below, and keep a clear route to its full detail for advanced editing and resources.
- If there is exactly one Arrangement, make its playable content and Practice path easy to reach without implying the Song and Arrangement are the same object. If there are several, present an explicit version choice. If there are none, explain that arrangements contain playable material and offer the permitted creation action.
- Keep secondary identity metadata (Genre, attribution, tags and rights notes) visible/editable without hiding where lyrics/chords are edited. Genre is a separate Song field under ADR-0104; it is not stored as a tag.
- Display resource and lyrics loading/error states with retry. Keep missing content distinct from failed requests.

### 4.3 Creation and edit flows

- Preserve ADR-0074 modal creation, group-themed controls and mobile full-screen dialog behavior.
- Keep the quick Song identity task short. Expose optional initial Arrangement/resource work as clearly optional steps; preserve the valid “Song only” outcome. When users choose to prepare playable versions during creation, allow multiple Arrangements in the same wizard. Each keeps its own existing Arrangement fields and may receive its own Resource; never create a duplicate Song to represent a different version.
- If a workflow performs several existing server operations, show which parts have saved, which remain, and provide retry for only the incomplete step. Never imply atomicity or silently delete already-saved entities to simulate rollback.
- When a dirty modal closes, escape/backdrop/close first asks whether to discard. Cancel returns to the exact draft and focus; discard closes. For a clean modal, close remains immediate.
- On version conflict, retain the user's local draft and offer reload/review. Never auto-overwrite concurrent server data.
- Errors name the recoverable action in localized UI copy; do not display raw server strings.

### 4.4 Arrangement, lyrics and Resources

- Keep edit scope on the Arrangement route. Split lyric authoring into progressive modes (text/Chords/Timing or the smallest equivalent supported by the current model); show controls for the selected line/word instead of the full timeline control set at once.
- Keep Save and Cancel persistently findable on mobile and desktop. Switching mode does not discard edits. Dirty close and conflict handling follow §4.3.
- Import remains preview then explicit apply. Explain whether timing/structure is preserved or lost for each supported format. Lookup stays an explicit reviewed candidate and never applies automatically. Exports accurately describe their existing fidelity.
- Resource creation uses the existing file/link contract, clear file eligibility and size guidance, and retryable upload states. A confirm step is required for irreversible Resource deletion and identifies the exact Resource.
- Preserve existing authorization, payload shape, validation and file limits. Do not add a new resource kind or metadata model.

### 4.5 Practice and Stage

- Keep existing Practice tabs and audio engine. Make each tab keyboard-operable following one consistent ARIA tab pattern; preserve deep links and selected tab on reload.
- On small screens, compact the persistent/global player so it does not cover the active content or primary control. Keep text labels for unfamiliar icons and expose play state/track to assistive technology.
- Stage remains a separate deliberate immersive mode, with a clear entry and a reliable return/focus destination. “Send another screen” must report whether a second display opened or provide a recovery path; do not claim success when blocked.
- Preserve microphone permission states, feature flags, same-browser sync checks and reduced-motion behavior. Do not activate devices without a user gesture.

## 5. Cross-cutting requirements

- Use existing `groups/ui` primitives and scoped `--brand-*` tokens; no new typeface, color model or dependency.
- Every new user-visible string lives in es/en/pt locale files and is rendered through the project's translation helper.
- Support keyboard-only operation, visible focus, correct names/states for controls, logical focus return on dialog close, and tab arrow/Home/End behavior consistent with the selected ARIA pattern.
- Target 44×44 CSS px touch controls where practical; maintain WCAG 2.2 AA contrast and reflow at 320 CSS px without page-level horizontal scrolling. Validate rather than infer compliance from token names.
- Respect reduced-motion settings. Use motion only to clarify state or transition.
- Do not change Group authorization, request contracts, database schema, storage lifecycle, canonical paths or feature flags for presentation convenience.
- Reconcile permission-dependent visibility with the existing server capability contract before changing controls. Do not invent a new permission model or permit an action based only on the client.

## 6. Incremental delivery stages

| Stage | Outcome | Main areas | Dependencies / risk |
|---|---|---|---|
| 1. Draft safety and feedback | Dirty-close handling, explicit partial-save/retry state, visible detail errors and retained conflict drafts | GroupDialog, CreateSongWizard, SongDetailPage, ArrangementDetailPage, localized messages | Establish exact existing save/error contracts; medium regression risk |
| 2. Library wayfinding | Responsive density, distinct empty states, persistent query state and stable return behavior | LibraryPage, routes/query parsing, es/en/pt, library E2E | Preserve existing paged-list contract; low–medium risk |
| 3. Song to playable version | Clear zero/one/many Arrangement paths, related content, accurate tag editing and capability presentation | SongDetailPage, song API/DTO only if already supported, effective permission source | Confirm capability DTO behavior; medium risk |
| 4. Creation and Resources | Short optional creation steps, dirty-modal guard, partial retry, exact resource guidance/confirmation | CreateSongWizard, resource forms/API UI, dialogs, upload state | Preserve modal ADR and partial server saves; medium–high risk |
| 5. Arrangement editing | Progressive lyric/chord/timing authoring and conflict-safe saves | ArrangementDetailPage, VisualChordEditor, lyric panels/helpers, translations | Preserve rich timing roundtrip and import/export semantics; high risk |
| 6. Practice and Stage | Consistent accessible tabs, compact mobile playback, verified second-display feedback/focus | PracticePage/Player, StageModePanel, StageOutputPage | Do not alter audio/permission feature boundaries; medium–high risk |

Each stage is reviewable separately. Do not rewrite the repertoire module wholesale. Keep API/backend changes limited to a confirmed contract defect required for correct user-visible behavior; add an ADR proposal if an accepted boundary must change and stop that portion for owner decision.

## 7. Validation plan

- Add focused component tests for dialog dirty state/focus return, editor mode transitions, empty/error distinction, query serialization/restoration, tab keyboard behavior and partial-step retry.
- Extend existing `e2e/tests/library.spec.ts`, Song detail journeys, `rich-lyrics.spec.ts`, `practice.spec.ts`, `w19-stage-mode.spec.ts` and resource-access journeys for the exact changed flows. Critical journeys use the real React → API → Identity cookie → PostgreSQL path; do not replace authorization with client mocks.
- Add API/integration tests only if implementation changes an API contract, capability source, upload/delete behavior or concurrency handling. Preserve Group and parent/child resource denial tests.
- Run the targeted tests for each stage, then applicable web typecheck/build and relevant .NET suites. Report exact commands and results; do not claim unrun suites.
- Manual review at 320, 390, 768, 918, 1440 CSS px; desktop and mobile; light/dark and branded Group theme; keyboard, screen reader, reduced motion and es/en/pt. Validate no dialogs or players obscure the primary task.
- Conduct a short formative session with 4–6 less-confident computer users after the core flows are implemented. Record observed tasks, errors and recovery; do not turn the sample into statistical claims.
- Do not run destructive staging operations or apply migrations as part of this UI scope.

## 8. Acceptance criteria

1. A person can locate/search a Song, distinguish no matches from no Songs, open it, and return with the same library state using browser back.
2. Search/filter/sort/page URL state survives reload; filter changes reset page; authorized and read-only users see appropriate controls without treating UI checks as authorization.
3. Song detail distinguishes zero, one and multiple Arrangements and gives a direct, understandable route to existing playable content and Practice.
4. Closing a dirty create/edit dialog by close, Escape or backdrop never silently loses work; cancel preserves draft, discard closes, and clean close is immediate.
5. Partial creation identifies saved and pending steps, and retry does not duplicate already completed work.
6. A failed detail request shows an error and retry; it is never presented as valid empty content.
7. A 409 retains the draft and allows review/reload without automatic overwrite.
8. Lyrics/chords/timing tasks expose only relevant editing controls at a time, preserve existing native/rich timing semantics, and keep save/cancel reachable at 320–390 px.
9. Import requires preview and explicit apply; format fidelity warnings are correct; lookup never auto-applies; export claims match actual format fidelity.
10. Resource add/delete accurately explains eligibility, size and irreversible effect; unauthorized requests remain rejected by the server.
11. Practice tabs support keyboard activation and state announcement; Stage returns focus and accurately reports second-display outcomes.
12. No page-level horizontal overflow at 320 CSS px; tap targets, visible focus, contrast, reduced motion and accessible names are verified.
13. All changed visible copy is localized in es/en/pt; route/catalog, Group brand scoping, domain boundaries, feature flags and accepted ADRs remain intact.
14. Relevant component/E2E/API tests and type/build checks pass for implemented changes, with exact results recorded.
15. No unrelated files, dependencies, migrations, staging data or configuration are included.
16. The Canciones row menu opens Song editing in a dialog without changing routes; clean Cancel closes immediately, while dirty Cancel/Escape/backdrop asks before discarding and preserves the draft when canceled.
17. Song detail shows “Versiones” and selects the materials displayed in the Letra/Acordes/Notas/Archivos workspace; broad labels do not imply that Sonivo is only for singing.

## 9. Decisions and documentation

ADR-0106 records the owner's explicit selection of a list-first Canciones presentation and amends only ADR-0055 W-B's dense desktop table pattern. Song detail information/tabs remain unchanged. A change from modal creation to route-based creation still conflicts with ADR-0074 and requires an amendment. A permission UX solution that requires a new capabilities endpoint must first establish that the current server contract cannot support the needed presentation; any new authorization semantics require an ADR and owner decision.

After implementation, update only the relevant stage evidence and validation status in this spec and `.scratch/NOW.md`. Do not duplicate the spec into `CONTEXT.md` or revise ADRs without a material accepted-decision change.

**Implementation follow-up (2026-10-27):** The owner selected the responsive list-first proposal; the library row edit action opens a Song edit dialog, and the Song detail version section precedes the tabbed workspace. Existing list contracts, Song update API and role authorization remain in use. Local production build and browser verification passed; `TC-LIB-09` was added for the dialog route/dirty-cancel behavior. The standalone E2E runner remains unverified because `@playwright/test` is absent in this worktree.

**Implementation follow-up — searchable version picker (2026-10-27):** Song detail now shows only the active version summary and a “Choose/Change version” action instead of listing every version inline. The existing group dialog opens a searchable, scrollable list; search matches version label, key and tempo. Choosing a version updates the materials on the same page, while zero/one/many Arrangement behavior and the no-default-selection domain rule remain unchanged. No API, persistence, permission or route contract changed. App TypeScript check and production build passed. The local Playwright browser verified search with no matches and a matching result, selection updating the visible materials, Escape closing the dialog and restoring focus, and a narrow responsive viewport. The requested 390 px override was reported by the browser as 520 CSS px, so exact 390 px rendering remains unverified. No song data was written.

**Implementation follow-up — Arrangement detail workspace (2026-10-27):** Arrangement detail now presents the lyrics/chords workspace before rehearsal materials and gives editing a focused surface. Link and file resource forms open in separate group-themed dialogs with dirty-draft protection. Advanced timed lyric import/lookup is progressively disclosed inside the lyric editor, previews before apply, and updates the unsaved editor draft; the basic text/ChordPro import remains available. The existing manual timing editor can be entered after typing lyrics without an LRC file. No API, persistence, route, authorization or format contract changed. App TypeScript check and production build passed; local Playwright browser verified editor/read separation, resource-dialog dirty-close recovery, plain text into timing mode, and edit discard. `git diff --check` and the Impeccable detector passed (0 findings). Dedicated E2E runner and exact mobile viewport remain unverified; no resource or repertoire data was saved.
