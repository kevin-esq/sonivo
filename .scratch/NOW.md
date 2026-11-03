# NOW — current work and Git checkpoint

## T-SONG-METADATA-TAGS — Song details and managed tag catalog

**Updated:** 2026-11-02
**Authorization:** Owner requested optional album, release year, cover art, and Group-admin-defined Song tags. ADR-0110 accepted for this scope.
**Spec:** [`../docs/03-architecture/PHASE-SONG-METADATA-SPEC.md`](../docs/03-architecture/PHASE-SONG-METADATA-SPEC.md)
**Batch scope:** Lyrics import/edit/playback; chord and progression editing; arrangement defaults, practice materials and route flow; audio player and tuner; Song album, year, cover and managed tags.
**Implementation:** COMPLETE locally. Songs support optional album, release year, and JPEG/PNG/WebP cover. Group Owners manage predefined tags; Song editors select catalog options only. Migration backfills existing live Song tags, including catalogs above 50 entries, without changing Song assignments.
**Validation:** Full Release solution build passed (10 projects, 0 errors, 3 warnings); focused .NET tests passed (66 tests across Domain, Application and API); app TypeScript and production build passed; `git diff --check` passed. Applied `AddSongCatalogMetadata` to local `sonivo_dev`; API readiness and frontend routes returned HTTP 200. Graphify source extraction completed, but graph rebuild failed because installed NetworkX lacks `louvain_communities`. Authenticated browser checks and Playwright were not run.
**Human approval:** APPROVED for one batched commit and PR on 2026-11-02.
**Git checkpoint:** COMMITTED.
**Remote:** PUSHED; PR [#314](https://github.com/kevin-esq/sonivo/pull/314) is open against `develop`.
**CI:** Initial backend build failed on one stale Arrangement test call; fixed locally, rerun pending push.


## Practice tools, PDF preview, and Song deletion placement

**Updated:** 2026-11-02
**Authorization:** Owner requested a working PDF preview, more useful voice/arrangement practice tools, a full warm-up breadcrumb, and Song deletion inside Song edit details. OSS research was constrained to React and .NET.
**Implementation:** COMPLETE locally. PDF blobs now carry PDF MIME when metadata omits it, and the PDF iframe no longer applies sandbox flags that can block the browser viewer. Warm-up keeps the full breadcrumb. The Practice header uses consistent padding and spacing across tabs; its event subtitle retains space while hidden, the stage-mode control stays mounted but visually hidden, and Edit stays visible. Practice tool copy describes concrete actions, and an empty non-event live-rehearsal placeholder is removed. The local tuner plays a selectable E2–C6 reference tone, compares microphone pitch against it with a 5-cent in-tune threshold, and smooths small pitch fluctuations. Song deletion confirmation is a view inside the existing edit dialog; the edit draft remains mounted while confirmation is shown.
**OSS research:** No relevant project found that combines a React interface with a .NET backend. `pyymenta/tuner` is React-only; ChordFlow is a .NET desktop app. No third-party source code was copied. Tuner audio and microphone analysis remain local; existing Sonivo .NET arrangement and digitizer APIs remain unchanged.
**Validation:** App TypeScript check passed (`npx tsc --noEmit -p tsconfig.json`); `git diff --check` passed. Automated and browser tests not run. API was not changed.
**Human approval:** PENDING.
**Git checkpoint:** PENDING; no commit.
**Remote:** NOT PUSHED.
**CI:** NOT RUN.

## ChordPro parser integrated into Sonivo.Application

**Updated:** 2026-11-02
**Authorization:** Owner requested the parser source live in the consuming Sonivo project, with no separately named Menees project/reference.
**Implementation:** COMPLETE locally. Moved parser source into `Sonivo.Application/Repertoire/ChordPro`, renamed namespaces to Sonivo-owned names, removed its project from the solution and project reference, and preserved MIT license/attribution in that folder. Old generated build outputs were moved under `.scratch/former-chordpro-project`.
**Validation:** Sonivo.Application build passed (0 errors, 1 existing CS8602 warning). API build passed (4 projects, 0 errors, 2 existing NU1510 warnings). No code references to `Menees.Chords` or the old project path remain outside attribution.
**Human approval:** PENDING.
**Git checkpoint:** PENDING; no commit.
**Remote:** NOT PUSHED.
**CI:** NOT RUN.

## Group-wide default arrangement

**Updated:** 2026-11-02
**Authorization:** Owner chose one shared default version for the whole Group.
**Decision:** ADR-0109 supersedes ADR-0025's no-preferred-Arrangement clause. The nullable Song pointer backfills to each song's oldest live Arrangement; first Arrangement is selected automatically. Owners can change it with Song `expectedVersion`; deleting the default promotes the oldest remaining live Arrangement.
**Implementation:** COMPLETE locally. `Song.DefaultArrangementId` is Group-shared; migration backfills oldest live version. First created version becomes default. Owners change it from Song details; Song `expectedVersion` protects the update. Deleting the default promotes the oldest live version. Arrangement lists mark the default; Song details and Practice entry select it when visible, else use the first accessible version. Version selector never exposes IDs for hidden arrangements.
**Validation:** .NET API build passed (4 projects, 0 errors, 2 NU1510 warnings); app TypeScript passed; `git diff --check` passed. Applied pending `AddArrangementHarmonyJson` and `SetDefaultArrangement` migrations to local `sonivo_dev`; EF reports no pending model changes. Restarted Next at `http://localhost:5176` and API at `http://localhost:5171`; frontend returns 200 and unauthenticated API request returns 401. Authenticated UI interaction and automated tests not run.
**Human approval:** PENDING.
**Git checkpoint:** PENDING; no commit.
**Remote:** NOT PUSHED.
**CI:** NOT RUN.

## Arrangement practice route and edit modal

**Updated:** 2026-11-02
**Authorization:** Owner requested `/app/groups/:groupId/arrangements/:arrangementId` as the practice screen, with Details and Materials kept inside its edit modal; Lyrics and Chords remain dedicated editor pages.
**Implementation:** COMPLETE locally. Canonical arrangement route now renders Practice in Next.js `GroupRouteContent`; legacy `/practice` redirects to it while preserving query/hash. Old `/edit` overview/details/materials URLs no longer render the Arrangement detail page. The Practice edit dialog switches locally to embedded Details or Materials. Link/file creation forms render inside that dialog; Lyrics/Chords keep their full-page routes. Song details now open a Materials-only dialog for the selected Arrangement. Removed Practice self-links and its obsolete arrangement breadcrumb.
Song metadata editing from Song details now uses the same guarded modal pattern as Song editing from the library.
Song versions now appear as selectable cards, four per page. Arrangement resource purposes are separate sections with four resources per page and localized pagination labels.
Practice breadcrumb now ends at the version name. Practice lists arrangement materials by audio, documents/PDFs, images, videos, links, and other files, five per page per category; audio selection remains in PracticePlayer.
**Validation:** App TypeScript and `git diff --check` passed. Opened the canonical URL in the authenticated browser and confirmed Practice tabs, audio, lyrics, and stage mode render without the old Arrangement detail page. Did not test edit/save/upload interactions, Song Materials dialog, Song edit modal, pagination interactions, or legacy redirect.
**Human approval:** PENDING.
**Git checkpoint:** PENDING; no commit.
**Remote:** NOT PUSHED.
**CI:** NOT RUN.

## Lyrics timing editor reference patterns

**Updated:** 2026-11-01
**Scope:** Apply useful patterns from the supplied lyric editor references: visible audio-first line marking, clear selected-line context, and focused word timing adjustment.
**Implementation:** COMPLETE locally. Lyrics editor uses a responsive audio/score layout; mark line start and end from the shared player; show both line bounds; edit a selected word in a full-screen mobile/large desktop dialog with editable word text, shared playback controls, seek bar, timing range, precise start/end inputs, ±50 ms nudges, playback from the word, and timing removal. Existing timing validation prevents overlap with adjacent words. No backend or dependency changes.
**Follow-up:** Word timing popup exposes playback speed from 0.10× to 1×. It restores the shared player’s prior speed when closed.
**Validation:** App TypeScript check and `git diff --check` passed. Browser behavior not verified in this task. The ruler shows the selected time interval and playhead; it does not draw audio waveform peaks because the current editor has no waveform data source.
**Human approval:** PENDING.
**Git checkpoint:** PENDING; no commit.
**Remote:** NOT PUSHED.
**CI:** NOT RUN.

**Follow-up:** The edit chooser, Details, and Materials use dialogs. Lyrics and Chords open their dedicated full-page sections from both Arrangement and Practice.

## Lyrics import and lookup UX refinement

**Updated:** 2026-11-01
**Branch:** `codex/songs-ui-updates` in the isolated `songs-ui-updates` worktree.
**Scope:** One mobile-friendly “Añadir letra” dialog offers Buscar, Archivo, and Pegar texto. Lookup accepts title-only searches, returns selectable LRCLIB synced recordings, and keeps artist/album optional. Switching to review preserves search text and results; missing lyrics show a not-found status, while provider outages remain errors. Apply and save remain explicit.
**Implementation:** COMPLETE locally. One GroupDialog holds search, file import, and paste/review; selecting a candidate fills the draft without losing the lookup state. 404/422 lookup results use an informational not-found state; outage statuses retain provider-error copy. Fixed nested-form hydration error. Exports remain on the arrangement view. ADR-0107 records accepted lookup behavior. No persistence or dependency changes.
**Validation:** Targeted API lookup test passed, including null duration; app TypeScript and `git diff --check` passed. Earlier Playwright runs passed W18 import/review/save/export and title search/mobile modal/state preservation. The latest 404 regression test did not reach lyrics search: `createGroup` received API 201 but its expected heading did not appear. A live LRCLIB run returned HTTP 200 and loaded selected synced lyrics. Worktree API uses localhost:5171; E2E left demo Group/Song records in local development DB.
**Human approval:** PENDING.
**Git checkpoint:** PENDING; no commit.
**Remote:** NOT PUSHED.
**CI:** NOT RUN.

## Song library UX redesign — PR #305

**Updated:** 2026-10-28
**Branch:** `feature/song-library-ux-redesign`, synced with `develop` at `252234d`; the three Song UX ADRs were renumbered 0104–0106 to preserve the existing ADR-0103.
**Implementation:** COMPLETE for the approved Song library, detail, multiversion creation, Arrangement editing, lyrics/chords, Resources, and Practice scope. Storybook stories and the local song redesign prototype are included.
**Human approval:** APPROVED; the user explicitly authorized commit, push, and PR creation when the planned scope was complete.
**Git checkpoint:** COMMITTED; `develop` sync is `1e8585b` (`chore(repertoire): sync song redesign with develop`). Prior follow-ups `b95e244`, `990e757`, `529a2ea`, and original redesign `1e8939c` remain committed.
**Remote:** PUSHED to `origin/feature/song-library-ux-redesign`; [PR #305](https://github.com/kevin-esq/sonivo/pull/305) is open against `develop`.
**CI:** Latest completed run on `1e8585b` passed the other 5 checks; Playwright had 117 passed, 2 skipped, and 1 failure. W11 measured the password reveal target at `43.999969px` against its 44px CSS minimum.
**CI follow-ups:** Updated stale journey expectations to match progressive disclosure, draft-then-save lyrics editing, the version chooser, and current localized copy. Fixed Stage mode status persistence. Latest trace confirmed the digitizer PATCH returns 200; the Arrangement refresh was clearing the page and unmounting the digitizer before its success feedback could persist. The follow-up keeps the current detail mounted during refresh. The empty-library test now verifies the persistent search visible in the product. W11 now allows a 0.001px browser subpixel tolerance; its local focused test passed. No API or domain contracts changed.
**Validation:** Next production build passed locally, including TypeScript checks. Targeted Playwright passed: TC-LIB-07/05, TC-LIB-08, TC-PLAY-SYNC-01, both Whisper digitizer journeys, W2 empty/readiness/resources, W7 hierarchy, W18 LRC import/export, and W19 stage mode. The rich-lyrics and W-F detail runs could not complete locally because the local API did not create their test Group; CI reached those journeys. `git diff --check` passed.
**Open gate:** Push the W11 precision correction and review the full CI result on that head. Do not merge until all CI checks pass. No PR merge was performed.
**Penpot:** remote OAuth registration did not complete (HTTP 405); the connection is not functional and no token was added to repository files.


## T-UX-SIDEBAR — Gmail-style desktop navigation

**Updated:** 2026-10-28
**Authorization:** The user requested a new worktree from `develop` and a sidebar with a persistent compact icon rail, animated hover preview over the content, and a top button to pin it open.
**Branch:** `feature/sidebar-gmail-redesign`, based on `develop` at `937ab43`.
**Scope:** Account and Group desktop shell navigation. User clarification: one full-width header contains the menu button, persistent brand, search, and account controls; only the navigation beneath it collapses or previews. Preserve destinations, Group branding, and the global player while applying the subsequent mobile navigation requests below. Preview by pointer or keyboard; Escape dismisses preview. Persist the existing `sonivo:sidebar` preference. Remove the redundant Group switcher; keep My groups in the user menu. Use theme-aware hover/focus surfaces in profile and mobile navigation menus. Compact section headings show two-letter abbreviations derived from their localized labels; expanded headings keep the full label and navigation positions. Group administration (Reports, Group settings, Help) is normal scrollable navigation, visible only to the Owner, with the same visibility in the mobile More menu and no duplicated links. Account navigation is Main, Account (Profile, Security, Preferences, Notifications, Membership), and Support. Motion opens the panel in 320 ms using the user-requested Gmail/Material cubic-bezier(0.4, 0, 0.2, 1) curve and progressively reveals labels by category using opacity, overflow clipping, forced single-line labels and a 6 px horizontal offset; closing is faster and reduced motion removes spatial animation. Mobile uses a visible brand/title row with compact search, notifications and profile actions, plus horizontally scrollable section pills. Group mobile quick links are Home, Songs, Setlists, Events, Tasks, Members and Resources, in that order. More holds secondary and role-gated administration destinations without duplicating quick links or the header calendar. The latest user clarification removes the mobile bottom navigation: quick links appear once at the top, with a More menu for remaining destinations and the same top More menu for account/support settings, with no mobile side drawer. Search replaces the quick row in place and dims/blurs the surrounding page; dismissal restores the row. Account and Group notifications share one explicitly scoped bell/popover module. Mobile focus layers blur/dim only the area below the complete header, keeping the logo, actions, navigation and search clear; Escape/outside dismissal restores the page. Notification panels stay below the mobile header and inside the viewport. The existing global audio player floats above the bottom safe area. After completing the blur correction, the header includes a calendar shortcut: the general calendar outside a Group and the current Group calendar inside one. The mobile More menu does not duplicate that shortcut. Role-gated administration remains available. The Group profile menu uses consistent 16 px icons for My groups, account notifications, account, Help and sign-out. The user also authorized one shared logout confirmation for all account and Group entry points, with Cancel initially focused and no logout request until explicit confirmation. The user then requested a reference-inspired floating player capsule on mobile and desktop: visible track metadata, Sonivo artwork fallback and accent, compact transport controls, a progress-highlighted sound mark on desktop, and an options panel for volume, seeking and compact/close controls. Transport skips move 10 seconds within the current track. Player Escape handling is scoped to player focus so it does not interfere with dialogs or search. No API, authorization, domain, or dependency changes. The existing shell specifications remain the baseline: [dashboard](../docs/03-architecture/PHASE-HOME-DASHBOARD-SPEC.md) and [workspace](../docs/03-architecture/PHASE-WORKSPACE-REDESIGN-SPEC.md).
- **Implementation:** COMPLETE locally - navigation and blur, contextual calendars, menu icons, shared logout confirmation, responsive player capsule, and Gmail/Material desktop sidebar motion.
- **Human approval:** APPROVED - the user explicitly authorized versioning all completed shell/player changes, publishing the feature branch, and merging to develop on 2026-10-27.
- **Git checkpoint:** COMMITTED - implementation commit `d2a3544`.
- **Remote:** PUSHED - `origin/feature/sidebar-gmail-redesign`; [PR #304](https://github.com/kevin-esq/sonivo/pull/304) targets develop.
- **CI:** FAILING on implementation commit `d2a3544`: the full browser suite reports 112 passed, 2 skipped and one ambiguous brand selector in W6. The visible-header selector correction passes both local W6 tests; PR #304 will rerun before merge.
- **Previous validation:** The new browser regression reproduced the original content shift (72 → 256 px). Six targeted Playwright checks passed (account/Group overlays, pinning, keyboard/Escape, persisted preference, reduced motion, mobile drawer/tabs, and 44 px touch targets). App TypeScript check passed. The final Next.js production build and `git diff --check` passed. Remote CI passed backend (858 tests), frontend, SCA and CodeQL. The first full Playwright run failed only the W6 selector because hidden desktop/mobile brand variants both matched. The follow-up scopes the visible header brand, asserts one match, and preserves desktop contrast checks while adding mobile light/dark checks. Both W6 tests pass locally; full remote validation remains required.
- **Current validation:** Across the latest targeted runs, two logout-confirmation checks, one existing authentication login/logout journey, and three account/Group sidebar plus persistent-player checks passed. Logout coverage verifies initially focused Cancel, Enter/Escape cancellation without logout requests, explicit confirmation, and protected-route guest redirection. Player coverage verifies visible metadata and viewport bounds at 320/390 px, desktop waveform seeking, exact volume input, bounded 10-second skips, compact/expanded controls, playback persistence across routes, real theme changes through Preferences, and cancellation of logout without closing the player. Both desktop sidebar checks verify overlay geometry, pinning, keyboard dismissal and persisted preference with the requested easing. Dark/light player captures were inspected. TypeScript passed. Component/player CSS scans passed; the three documented desktop width-animation advisories remain intentional. Final Next.js production build and type validation passed. Git diff whitespace validation passed. No CI run was triggered.
- **Local preview:** Worktree Next server on `http://localhost:5175`, isolated Development API on `http://localhost:5176`, existing local PostgreSQL on port 5433. Dependencies are copied from the existing installation; no packages were installed.
- **Design scan:** Three advisory width-animation findings. The animated rail surface is absolutely positioned, so hover expansion does not relayout page content; the reserved slot changes only when the user pins/unpins it. Browser assertions verify unchanged content position and width during preview.
- **Git actions:** Commit, push, PR creation and merge to develop explicitly authorized by the user on 2026-10-27. Merge follows passing CI.

## Local release batch

**Updated:** 2026-10-26
**Scope:** Complete the user-authorized local batch on `feature/local-release-completion`, based on `develop` at `b8246af`: rich lyric interoperability (ADR-0100/0101), searchable/favoritable Song library, media streaming improvements, native-client completion, and fixes to previously failing Playwright journeys. Next.js App Router/auth/routing changes from merged `develop` are preserved; no route catalog or security boundary was replaced.
- **Implementation:** COMPLETE locally. Four previously failing Playwright journeys were fixed and pass. No schema migration was applied to a database.
- **Human approval:** APPROVED for this batch and explicit authorization to commit, push, and open a PR after validation.
- **Git checkpoint:** COMMITTED (`feat(repertoire): complete rich lyrics and library workflows`).
- **Remote:** PUSHED to `origin/feature/local-release-completion`; PR #302 is open against `develop`.
- **CI:** RUNNING on PR #302; latest observed checks are pending.
- **Validation:** `.NET Release`: 858 passed, 0 failed; Next.js production build and app TypeScript check passed; Playwright: 112 passed, 2 feature-flag skips, 0 failed; Android `assembleDebug` passed with JDK 21; `git diff --check` passed. iOS build/device QA was unavailable on this Windows host.
- **Open gates:** Review PR CI; do not apply the included migration to staging/production from this checkpoint. Existing production, mobile provisioning/device QA and web host cutover gates remain governed by their phase specs.
- **Git policy:** no files under `.codex-remote-attachments/` or scratch research/review notes are included.

## Previous checkpoint

PR #300 merged the public/product route foundation and PR #301 merged the static-export E2E isolation fix. `develop` was at `b8246af` when this batch branched. Preserve WBR deployment, staging, OAuth, production database/RLS and native mobile release gates documented below.

**EasyLRC integration:** Cloned the full upstream repository into .scratch/reference-easylrc with MIT license. Adapted line/word mode, sequential word cursor, line navigation, bounded timing undo, and 200 ms seek inside Sonivo's full-screen editor. Existing authenticated audio resources, LRC preview/import, validated timeline, global retiming, and floating versioned save remain the integration seams. App TypeScript, git diff --check, and edit route HTTP 200 pass; authenticated visual/interactive check not done.
