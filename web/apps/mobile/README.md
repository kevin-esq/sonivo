# Mobile workspace pointer

Native clients are prepared under the repository root at `mobile/android` and
`mobile/ios`, outside the TypeScript workspace:

- Android: Kotlin + Jetpack Compose, using AndroidX Media3/ExoPlayer.
- iOS: Swift + SwiftUI, using AVFoundation/AVPlayer.

This directory is a compatibility pointer. Do not add an Expo or React Native
application here. The ASP.NET Core API remains the only data source. Group
authorization is enforced by the server.

Native sign-in and authenticated member journeys are being implemented in the platform projects.
Current setup, API configuration, completed journeys, and validation limits are documented in
[`mobile/README.md`](../../../mobile/README.md) and
[`PHASE-MOBILE-NATIVE-SPEC.md`](../../../docs/03-architecture/PHASE-MOBILE-NATIVE-SPEC.md).
