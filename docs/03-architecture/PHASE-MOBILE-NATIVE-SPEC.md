# Native mobile clients — phase specification

**Status:** In progress under explicit user authorization dated 2026-10-19; full authenticated web-app parity was additionally authorized by ADR-0098 on 2026-10-20.

## Goal

Provide native Android and iOS clients for the authenticated Sonivo product. Replicate the current authenticated web destinations and their existing actions, adapted to platform conventions. Keep the ASP.NET Core API as the only data source and preserve server authorization, existing domain rules, and validation.

The user selected Kotlin + Jetpack Compose on Android, Swift + SwiftUI on iOS, AndroidX Media3/ExoPlayer, and AVFoundation/AVPlayer. Projects live outside the TypeScript workspace at `mobile/android` and `mobile/ios`. ADR-0094 authorizes OIDC Authorization Code + PKCE. The user also explicitly authorized server-enforced minimum supported app versions.

## Scope matrix

| Classification | Capability | Phase treatment |
|---|---|---|
| Existing accepted product behavior | Member selects an accessible Group; reads Songs, Arrangements, Arrangement Resources, Event plans, and Setlists; submits the existing RSVP choices; opens Practice for an Arrangement. | In for the first member journey, subject to the existing server contracts and auth gate. |
| Existing accepted Practice behavior | ChordPro/plain-text chart display, resource selection, native local playback, position seeking, and timestamp-based line highlight. The Event conductor may update the local playhead; it does not transport or synchronize audio. | In, with the current web product behavior as the parity reference. |
| Full authenticated app parity (ADR-0098) | All signed-in destinations and their existing actions in the web app: global Home, Groups, Join, Profile, Notifications, Preferences, Membership, Help, Security; Group Home, Songs, Arrangements, Practice, Setlists, Calendar, Events, Tasks, People, Roles, Reports, Resources, Audit, and Group Settings. Owner and Member actions follow the server's existing permission and plan rules. | In for both Android and iOS. Delivery tickets MOB-08–12 below track the parity work. |
| Requires additional rollout configuration | Production signing/encryption keys, exact redirect URI registrations, issuer/audience values, database migration, rate-limit configuration, and deployment ownership. | Development implementation is authorized by ADR-0094; production rollout stays blocked until those environment controls are configured and reviewed. |
| Operator-controlled client compatibility | The API checks the native platform/version headers and returns HTTP 426 when the configured minimum is higher than the installed app version. Web cookie requests are unaffected. | In. Configure per-platform minimum versions and store links server-side. |
| Retained exclusions | Marketing/SEO and browser cookie flows; offline mode and persistent downloads; audio transport between devices; stems/mixer; recording; karaoke scoring; cloud AI; loops/tempo changes; and new musical/domain behavior. | Out under ADR-0093/0098. Platform-specific equivalents may adapt a web interaction but must preserve its underlying authenticated task. |
| Existing Practice extras not selected for this member release | Tuner and external video references are governed by ADR-0037, but are not required to complete the first mobile member rehearsal journey. | Deferred from this phase. |

## Journey and screens

1. Group selection from the signed-in user's authorized memberships.
2. Group rehearsal home with upcoming Events and a clear empty/error state.
3. Event detail with copied plan labels and RSVP controls using existing semantics.
4. Read-only Setlist and Song/Arrangement navigation.
5. Practice chart, resource selection, playback controls, and timestamp line highlight.

Native Group-entry links accept `https://go.sonivo.lat/g/{slug}` and the root
`https://{slug}.sonivo.lat/`. The slug is persisted only as a pending app
destination across OIDC. After sign-in, clients match it against the authenticated
`GET /api/groups` result and open the Group only on a match; otherwise they keep
the account session and show an invitation/access message. A slug never creates
membership, changes OIDC issuer/API host, or authorizes Group data. The normal
app launch remains sign-in followed by the user's authorized Group list. Android
App Links and iOS Universal Links additionally require the release signing
fingerprint / Apple Team ID in their website association files before deployment.

Screens must not display seeded or fabricated production-looking records. Each uses localized es/en/pt copy and exposes loading, empty, denied, and error states.

## API and authorization map

| Screen/action | Existing contract | Authorization source | Gate |
|---|---|---|---|
| Group selection | `GET /api/groups` | User's Identity principal and membership checks | Implement with validated bearer token |
| Event list/detail | `GET /api/groups/{groupId}/events`, `GET /api/groups/{groupId}/events/{eventId}` | Server validates membership and Group scope | Implement with validated bearer token |
| RSVP | `PUT /api/groups/{groupId}/events/{eventId}/rsvp` | Server derives current user and checks Group membership | Implement with validated bearer token |
| Setlist list/detail | `GET /api/groups/{groupId}/setlists`, `GET /api/groups/{groupId}/setlists/{setlistId}` | Server validates membership and Group scope | Implement with validated bearer token |
| Song/Arrangement/resources | `GET /api/groups/{groupId}/songs`, nested songs/arrangements, arrangement resources and `/content` | Server checks membership, item grants, and Group scope | Implement with validated bearer token |
| Practice conductor | Existing `/hubs/practiceroom` methods | Identity principal and per-method membership/conductor checks | Implement with validated bearer token; position only |

The Group identifier is only a selector. Every Group-scoped request must be authorized by the server. Do not add a mobile shortcut or duplicate domain rules. Routes above were checked in `src/Sonivo.Api/Program.cs`; confirm DTO details and resource streaming headers before implementing transport. For the ADR-0098 surfaces, prefer the existing API operations used by `web/apps/app/src/api/` and `src/Sonivo.Api/Program.cs`. If a cookie-only operation needs bearer exposure, add only a thin adapter to the same authorized application operation; do not weaken cookie/antiforgery policy or fork business rules.

## Authenticated web-to-native destination map (ADR-0098)

| Web surface | Native coverage | Ticket |
|---|---|---|
| App Home, Groups, Join | Home/activity, accessible Group selector, invitation join | MOB-08 |
| Profile, Notifications, Preferences, Membership, Help, Security | Account settings, inbox/read state, language/theme, plan/usage, localized help, password/MFA/passkeys/sessions where platform APIs support the same controls | MOB-09 |
| Group Home, Songs, Arrangements, Practice, Setlists | Repertoire browsing and edits gated by server permissions; existing player/Practice journey | MOB-10 |
| Calendar, Events, RSVP, event plan, calendar export | Native calendar/list, event CRUD permitted by API, RSVP, attendee/plan actions, `.ics` export | MOB-11 |
| Tasks, People, Roles, Reports, Resources, Audit, Group Settings | Existing Owner/Member actions, role and resource grants, reports/export, files, branding/settings, and audit read views | MOB-12 |

Native navigation must expose every applicable destination through a visible tab, drawer/sheet, or contextual route. A selected navigation destination is not complete until it loads authorized real data, wires its current web actions where present, localizes es/en/pt, and represents loading, empty, denied, validation/conflict, and failure states. Device-only operations such as passkeys must use the platform WebAuthn/passkey API or present an honest localized unsupported state; they must never silently report success.

## Authentication gate

The web Identity cookie and antiforgery flow is not a mobile credential contract. ADR-0094 is **ACCEPTED** and authorizes OIDC Authorization Code + PKCE through the system browser, OpenIddict on the API, bearer validation, short access tokens, and rotating/revocable refresh tokens. Production use requires deployment-specific key and client registration configuration. When an operator sets a platform minimum version, bearer and token requests must include `X-Sonivo-Platform` and `X-Sonivo-App-Version`; older versions receive a structured `426 mobile_update_required` response and cannot reach protected APIs or exchange tokens.

## Playback requirements

- One application-scoped player state survives navigation and is released with the application/service lifecycle.
- Represent idle, preparing, ready, playing, paused, seeking, ended, and error states.
- Select only the currently authorized Arrangement resource; audio bytes remain served by the backend's existing resource access path.
- Drive chart highlight from the local player position and existing timestamp marks.
- Keep local audio position separate from conductor position messages. Conductor updates may seek/update the local playhead according to ADR-0036, never synchronize audio.
- Android uses ExoPlayer hosted by a `MediaSessionService`, with media session transport and system notification/lock-screen controls.
- iOS uses AVPlayer, the playback audio session, background audio capability, Now Playing metadata, and remote commands.
- Handle interruptions and route changes; do not resume unexpectedly after interruption or headphone removal.
- No persistent downloads, recordings, or custom audio DSP.

### Group Sing mode

Practice for an arrangement opened within the selected Group can switch to a focused, full-screen Sing mode. It uses the authorized arrangement audio, existing owner-authored line timing marks, and the arrangement's ChordPro body (falling back to plain lyrics). It highlights and follows the active line, provides playback/seek controls, and lets the singer hide or show chords. When timing marks are absent, the screen says so and does not imply that the lyrics are synchronized. This is a presentation of existing Practice data and does not add backend state or a new authorization path.

Apple Music Sing also advertises vocal-volume adjustment, separately animated background vocals, and duet views. Sonivo does not have vocal stems or those per-part timing tracks; those controls are not represented as available. Stem separation/mixing remains outside MOB-06 and requires separate product authorization under the scope matrix above. The current implementation follows existing line-level marks, not Apple's beat/word-level lyric timing.

Platform implementation references checked on 2026-10-19: [Media3 background playback](https://developer.android.com/media/media3/session/background-playback), [Media3 release versions](https://developer.android.com/jetpack/androidx/releases/media3), [Apple playback configuration](https://developer.apple.com/documentation/avfoundation/configuring-your-app-for-media-playback), [AVAudioSession](https://developer.apple.com/documentation/avfaudio/avaudiosession), and [MPRemoteCommandCenter](https://developer.apple.com/documentation/mediaplayer/mpremotecommandcenter).

## UX, accessibility, and localization

Use native navigation and platform conventions. Provide readable chart typography, compact rehearsal controls with accessible targets, VoiceOver/TalkBack labels, dynamic text, contrast-safe themes, and loading/empty/denied/error states. Keep UI copy in Android resources and iOS localization catalogs for Spanish, English, and Portuguese. No hardcoded user-visible strings in code.

## Delivery tickets and dependencies

| Ticket | Work | Depends on | Status | Acceptance |
|---|---|---|---|---|
| MOB-01 | Phase spec, scope matrix, ADR-0093 stack/location, ADR-0094 auth proposal | User authorization | Documents prepared; ADR-0094 accepted | Documents distinguish accepted behavior from rollout gates and excluded scope. |
| MOB-02 | Android Compose and iOS SwiftUI shells, navigation, es/en/pt resources, environment boundaries | MOB-01 | Source created; Android SDK/JDK/Gradle and WSL Swift/xtool/Darwin SDK are installed locally | Each platform opens to honest development states with no fabricated records or credentials. |
| MOB-03 | Isolated Media3 and AVPlayer engines plus OS media controls and lifecycle handling | MOB-02 | Source created; no device/simulator validation | Engines accept an authorized media URL from a future integration boundary; platform validation is recorded separately. |
| MOB-04 | Verify API/DTO/auth matrix and implement authenticated transport | ADR-0094 acceptance | Implemented locally; deployment remains gated; server mobile-session audit/account-security revocation and iOS build need verification | OpenIddict server, exact public clients, bearer transport, secure token storage, and version headers; every tenant operation remains server-authorized. |
| MOB-05 | Group/member library, Event/RSVP and Setlist journey | MOB-04 | Groups, Events, RSVP, and read-only Setlists integrated locally; device/API journey review pending | Implemented journeys have loading, empty, denied, and error states and match existing contracts. |
| MOB-06 | Practice chart, resource playback, Sing mode, conductor playhead and line highlighting | MOB-03, MOB-04, MOB-05 | Android and iOS now connect to the existing authenticated PracticeRoom hub, join/leave event rooms, and send/receive conductor position updates. Remote positions move chart highlighting only; audio remains local. Android debug APK and iOS Debug, Release, and arm64 simulator-target builds pass locally; device interaction remains pending. | Authenticated arrangement/resource-to-player flow, conductor room access, position updates, and timestamp highlighting are verified on each platform. |
| MOB-07 | Device/simulator quality review and launch-readiness report | MOB-06 | Pending. Android APK builds with the installed Android Studio JDK 21; the available emulator has raised a system-process ANR. iOS app bundles compile through xtool in WSL; iPhone installation and visual/device behavior remain unverified. | Accessibility, localization, interruptions, lock screen, routes, and lifecycle are checked on available platforms. |
| MOB-08 | Global authenticated shell parity: Home, Groups, Join, native navigation to every destination | MOB-06 | Authorized by ADR-0098; in progress | Android and iOS expose app-level destinations, selection state, Group switching, deep links, and localized loading/error states; global Calendar and group Help routes are now distinct native destinations. |
| MOB-09 | Account parity: Profile, Notifications, Preferences, Membership, Help, Security | MOB-08 | Authorized by ADR-0098; in progress (profile, notifications, preferences, membership, Help, password change, TOTP, passkeys, sessions, global plan/usage, and global Calendar filters/create are connected; edge-state review remains) | Account controls use existing contracts and platform APIs with server-confirmed outcomes; Owner plan changes and hosted checkout follow the configured provider and web return URL. |
| MOB-10 | Group repertoire/admin parity: Home, Songs, Arrangements, Practice, Setlists, Resources, People, Roles, Settings, Audit | MOB-08 | Authorized by ADR-0098; in progress (song and arrangement CRUD, member/invitation operations, custom roles, hierarchical member resource grants, setlists, resources and files, practice, group rename/delete, branding, group usage, notification preferences, and calendar-feed sharing are connected; device interaction and parity review remain) | Existing web operations are reachable natively; Owner/Member, plan, item grants, and Group authorization match server behavior. |
| MOB-11 | Scheduling parity: Calendar, Events, RSVP, event plan, calendar export | MOB-08 | Authorized by ADR-0098; in progress (global and group calendar views, multi-Group filters, Other/Only Mine, create event, create/edit/cancel/duplicate, apply-setlist, RSVP, attendee responses, practice room, group `.ics` sharing, and month/week/day navigation connected) | Existing event and calendar actions work from both clients; no new event or RSVP semantics. |
| MOB-12 | Tasks, Reports, exports, accessible files, cross-platform parity and completion review | MOB-08–11 | Authorized by ADR-0098; in progress (task create/edit/status/delete, reports and CSV, calendar sharing, file download/upload, and route-level parity are connected; iOS build and device interaction/parity review remain) | Every authenticated web navigation destination maps to functional screens in both clients; API contracts, locales, accessibility, and states reviewed. |

## Environment and validation

The implementation environment is Windows with WSL Ubuntu. Android SDK 36, JDK 17, and Gradle 9.1 are installed for this authorized task; the repository Gradle wrapper pins the Gradle distribution. Run `:app:assembleDebug` from `mobile/android` after setting `JAVA_HOME`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT`. iOS source compiles on WSL with Swift 6.4, xtool, and the Darwin SDK extracted from an Apple-provided Xcode `.xip`; device installation and interaction still require a connected iPhone and WSL USB passthrough (or a Mac/Xcode simulator). Document unrun validation explicitly. Routes, OIDC client/redirect/scope metadata, and platform/version headers belong in the per-platform endpoint catalogs (`ApiEndpoints.kt` and `MobileEndpoints` in `APIConfiguration.swift`); UI and API callers must not duplicate those contract strings.

## Release exclusions

No store signing or publication, production API configuration, new backend endpoints, database access from clients, push service, analytics, telemetry expansion, or Git checkpoint is included.
