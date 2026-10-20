# Sonivo native mobile clients

This directory contains separate native applications. It is not part of the TypeScript workspace.

## Android

Open `android/` in Android Studio with Android SDK 36 and JDK 17 available. The checked-in Gradle wrapper pins Gradle 9.1.0. The project uses Kotlin, Jetpack Compose, AppAuth, and AndroidX Media3. Debug builds read `SONIVO_API_BASE_URL`, optionally `SONIVO_OIDC_ISSUER`, and `SONIVO_WEB_BASE_URL` from the environment; these values default to empty. Release builds use the public production endpoints in [`Production.xcconfig`](Production.xcconfig). Example PowerShell debug build:

```powershell
$env:SONIVO_API_BASE_URL = "https://api.your-domain.example"
$env:SONIVO_OIDC_ISSUER = "https://api.your-domain.example"
$env:SONIVO_WEB_BASE_URL = "https://app.your-domain.example"
.\gradlew :app:assembleDebug
```

Sign-in uses the system browser, Authorization Code + PKCE, and an Android Keystore-encrypted AppAuth state. The member journey reads authorized Groups and Events, submits RSVP, loads Songs/Arrangements and Setlists, renders the chart, and plays authorized audio resources with bearer and app-version headers. Native routes and protocol headers are centralized in `ApiEndpoints.kt`.

## iOS

Open `ios/Sonivo.xcodeproj` on macOS with Xcode. The project uses SwiftUI, AuthenticationServices, CryptoKit, Keychain, and AVFoundation. Xcode Release reads the same public production endpoints from [`Production.xcconfig`](Production.xcconfig); Debug remains unconfigured unless its build settings are supplied. Sign-in uses `ASWebAuthenticationSession` and Authorization Code + PKCE. Access and refresh tokens are stored in the device-only Keychain. The app exposes authenticated account and Group destinations, including cross-Group calendar and plan management, alongside the rehearsal player. Native routes and protocol headers are centralized in `MobileEndpoints` in `APIConfiguration.swift`. Its background audio capability is declared for playback.

The same source also has a SwiftPM/xtool build path for WSL. Install the Swift 6.4 Linux toolchain and `xtool`, put both binaries on `PATH`, and set `APPIMAGE_EXTRACT_AND_RUN=1` for WSL. Install the Darwin SDK once from an Apple-downloaded Xcode `.xip` archive:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 xtool sdk install /path/to/Xcode.xip --slim
cd mobile/ios
swift package resolve
APPIMAGE_EXTRACT_AND_RUN=1 xtool dev build
APPIMAGE_EXTRACT_AND_RUN=1 xtool dev build --configuration release
APPIMAGE_EXTRACT_AND_RUN=1 xtool dev build --triple arm64-apple-ios-simulator
```

`Package.swift` points at the existing `Sonivo/` sources and pins the SignalR dependency to the same compatible range as the Xcode project. `Sonivo-xtool-Info.plist` stays unconfigured for ordinary SwiftPM/xtool builds. Xcode Release uses `Production.xcconfig`; for a WSL Release build run `bash build-production-wsl.sh` from `mobile/ios`. That script injects the same public endpoints only for the build and restores the development plist afterward. Building an app bundle does not sign it, install it, or replace iPhone/simulator UX review; no store signing or publication is included.

## Product and security gates

`mobile/.env.example` lists the API deployment settings and the public app build values. `mobile/Production.xcconfig` is the shared public endpoint source consumed by Android Release, iOS Xcode Release, and the WSL xtool production-release script; edit it only when the canonical production hosts change. Dotenv files are not loaded by the native build tools. Do not put client secrets in either native app; mobile OIDC is a public client protected with PKCE.

The API requires `X-Sonivo-Platform` and `X-Sonivo-App-Version` for bearer requests and token exchange. Set `Authentication__Mobile__MinimumVersions__Android` and `Authentication__Mobile__MinimumVersions__iOS` on the API to block older versions. Each non-empty minimum must be a three-part version and requires its matching `Authentication__Mobile__AndroidStoreUrl` or `Authentication__Mobile__iOSStoreUrl` HTTPS URL. A blocked client receives HTTP 426 with `code: mobile_update_required`, `minimumVersion`, and the store URL. Leave both minimums empty to disable the update gate. The gate applies only to native bearer/protocol traffic; cookie-based web traffic remains unchanged. Keep the API and OIDC host values centralized in deployment configuration and the two client build settings; endpoint paths and version headers remain centralized in each native `ApiEndpoints.kt` / `MobileEndpoints` catalog.

## Opening a Group from a link

Native apps accept `https://go.sonivo.lat/g/{slug}` and the root URL `https://{slug}.sonivo.lat/`. A tapped link stores the slug as a pending destination. The app completes the existing central OIDC Authorization Code + PKCE flow, loads `GET /api/groups`, and opens the Group only when the authenticated user's membership list contains that slug. A non-member remains signed in to their own account and receives an invitation message. The slug never grants access, adds a membership, selects an issuer, or changes the API host. A native app launched normally still signs in once and lets the user choose from their Groups.

The Android intent filters and iOS Associated Domains entitlement are in the clients. Production link verification also requires website association files: serve Android `/.well-known/assetlinks.json` with package `lat.sonivo.android` and the Play App Signing SHA-256 certificate fingerprint, and serve Apple's `/.well-known/apple-app-site-association` with the production Team ID plus bundle ID `lat.sonivo.ios`. Serve the association response on `go.sonivo.lat` and each tenant subdomain intended to open the app. Apple requires an association file for each subdomain; tenant hosts that should stay web-only must not advertise the app association. These deployment files are intentionally not fabricated before the store certificate fingerprint and Apple Team ID are known. OIDC redirect URIs stay the existing exact native schemes and are unrelated to Group links.

Before enabling mobile OIDC in a deployment, apply the `AddOpenIddictMobileAuthentication` migration, configure the HTTPS issuer and distinct signing/encryption certificates, and review redirect URIs, endpoint rate limits, refresh-token revocation, and production ownership. `Authentication:Mobile:Enabled` stays false by default. The additive migration has been generated but not applied to any database. The API does not migrate automatically in production.

See [`PHASE-MOBILE-NATIVE-SPEC.md`](../docs/03-architecture/PHASE-MOBILE-NATIVE-SPEC.md) and ADR-0093/0094 in [`DECISIONS.md`](../docs/03-architecture/DECISIONS.md). Group access remains server-authorized. Android and iOS clients use the existing authenticated PracticeRoom hub for event-room presence and conductor playhead updates; shared positions move chart highlighting but never transport audio. Android and iOS compile locally; device QA, session-audit/revocation verification, and deployment provisioning remain outstanding. Native API clients share per-platform catalogs for paths, OIDC client metadata, hub paths, and platform/version headers so contract updates stay localized.
