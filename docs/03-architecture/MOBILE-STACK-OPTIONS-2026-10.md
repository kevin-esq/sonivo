# Mobile stack options — research (2026-10)

**Purpose:** Compare candidate mobile stacks for Sonivo. This is research and a recommendation, not an accepted architecture decision or authorization to implement mobile scope.

## What Sonivo actually needs

- The product's rehearsal surface combines audio or click playback with ChordPro lyrics/chords, line highlighting, and event/setlist context. The existing web client uses an HTML media element; its custom player supports seek, volume, and track selection.
- Each musician currently plays on their own device. The Event conductor sends a playhead position at 1 Hz; it does not stream or synchronize audio. The accepted scope excludes audio streaming, stems mixing, recording, and pitch detection.
- Mobile is meant to serve musicians during rehearsal. Audio may need to continue when the screen locks, and users expect the transport to work with headphones, Bluetooth routes, interruptions, and system controls. These are product-quality requirements to validate, not currently accepted feature scope.
- The future mobile app is reserved at `web/apps/mobile`; its placeholder recommends Expo + React Native. Native Swift/Kotlin would live in a sibling `mobile/` directory, according to that placeholder.
- The current API uses Identity cookies + antiforgery for web. Native mobile bearer authentication remains a **FUTURE ADR**. The app must use the existing ASP.NET Core API and never connect directly to PostgreSQL.
- The current TypeScript API client has browser and Next.js-specific code. Some API contracts and translations may be shared, but not the web screens or whole client.

## A note on playback quality

The playback engine and its audio-session integration are more important to sound quality and resilient playback than the language used to draw the UI. Cross-platform frameworks can play background audio: for example, Expo documents lock-screen controls and background playback, and Flutter supports native plugin/platform integrations. Native development does **not** automatically make the sound better, nor does React Native automatically make playback choppy.

Native APIs do provide the most direct control over each platform's media lifecycle. Android recommends Media3 for playback; its MediaSessionService supports background playback and external controls. Apple AVPlayer handles local and remote media, while AVAudioSession and MediaPlayer APIs expose interruptions, route changes, and remote transport commands.

## Comparison

| Option | Advantages for Sonivo | Costs and disadvantages | Fit |
| --- | --- | --- | --- |
| **Native Android (Kotlin + Jetpack Compose) and iOS (Swift + SwiftUI)** | Direct ownership of Media3/ExoPlayer and AVFoundation/AVPlayer, audio sessions, background services, lock-screen controls, route changes, and each platform's accessibility and interaction patterns. Maximum room to tune a rehearsal UI independently on both platforms. | Two UI/client implementations, separate platform expertise, and more parity/QA work. Shares little app code with the TypeScript web workspace. | **Best choice when the top priority is the highest-quality native rehearsal experience and schedule is secondary.** |
| **Kotlin Multiplatform (shared logic, native UI)** | Share carefully chosen networking/state logic while keeping Android Compose and iOS SwiftUI interfaces and audio engines native. Can adopt code sharing incrementally. | Adds Kotlin/Gradle plus Kotlin-to-Swift interop. Sonivo already has a .NET backend and little existing client business logic worth duplicating or sharing, so KMP may add infrastructure without enough benefit. | Good if the team already has Kotlin expertise or later finds substantial cross-platform client logic to share. |
| **Expo + React Native (TypeScript)** | Fits the React/TypeScript team and monorepo. Expo Audio documents background playback, lock-screen controls, playback rate, seeking, playlists, and audio-session behavior. Good delivery speed while still rendering platform-backed UI. | Advanced needs can eventually require native modules/configuration. Does not reuse web UI; browser-specific API code needs separation. Less direct control over media plumbing than native when requirements become unusual. | Strong pragmatic choice; capable of Sonivo's current thin player scope, but not my selection under the stated “best possible UX regardless of time” priority. |
| **Flutter (Dart)** | Consistent, highly controlled UI toolkit and one cross-platform UI codebase. Native plugins/custom integration are available; playback can be implemented over platform media facilities. | Adds Dart and a separate client stack. Shares little TypeScript app code. Plugin/native integration still needs platform-specific validation for long-running playback and system controls. | Strong if shared visual consistency is the main priority, below native for maximum platform-specific control. |

## Recommendation

For the priority stated—excellent rehearsal UX and media playback, without optimizing for delivery time—recommend **two native apps: Kotlin + Jetpack Compose on Android, and Swift + SwiftUI on iOS**. Use each platform's native media stack and system integration, and design each UI to feel at home on its platform while preserving the same Sonivo information architecture and behavior.

Do **not** select Compose Multiplatform as the UI layer yet. KMP can be revisited for shared, genuinely valuable client logic, but Sonivo's backend already owns business rules and the present mobile need is chiefly presentation, media lifecycle, and platform integration. Do not introduce KMP solely to share API DTOs; generate or maintain platform clients from the API contract instead.

This recommendation is about control, integration, and UX—not a claim that cross-platform frameworks cannot sound smooth. Expo and Flutter can meet today's playback scope. If minimizing duplicated application work becomes more important than maximum platform-specific control, Expo + React Native remains the practical fallback.

Before implementation, revise the placeholder's stack/location recommendation through the repository's decision process, define mobile authentication in its additive future ADR, and pass the phase/ticket gates. This report does not supersede accepted ADRs or authorize implementation.

## Primary sources

- [Expo: Audio](https://docs.expo.dev/versions/latest/sdk/audio/) — background playback, lock-screen controls, seeking, playback rate, audio-session behavior.
- [Expo: Work with monorepos](https://docs.expo.dev/guides/monorepos/)
- [Flutter: Architectural overview](https://docs.flutter.dev/resources/architectural-overview)
- [Flutter: Platform integration](https://docs.flutter.dev/platform-integration)
- [Android: Media3](https://developer.android.com/media/media3)
- [Android: Background playback with a MediaSessionService](https://developer.android.com/media/media3/session/background-playback)
- [Apple: AVPlayer](https://developer.apple.com/documentation/avfoundation/avplayer)
- [Apple: AVAudioSession](https://developer.apple.com/documentation/avfaudio/avaudiosession)
- [Apple: MPRemoteCommandCenter](https://developer.apple.com/documentation/mediaplayer/mpremotecommandcenter)
- [Kotlin Multiplatform overview](https://kotlinlang.org/docs/multiplatform/kmp-overview.html)
- [Kotlin Multiplatform: Compose and Jetpack Compose](https://kotlinlang.org/docs/multiplatform/compose-multiplatform-and-jetpack-compose.html)
