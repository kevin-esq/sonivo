# Desktop presentation technology

**Status:** PROPOSED — not accepted. No desktop project exists. StageOutputPage and stageDisplaySync provide a browser-based starting point; requirements for MIDI, multi-monitor, device-specific audio, offline content, and low latency are not yet measured.

## Context

Kevin must define target musician hardware, minimum display count, MIDI/audio requirements, offline rights, installation/update model, support burden, and whether desktop is in current product scope.

## Owner decision required

Run a no-code spike against current stage mode. Select PWA if browser APIs meet measured needs. Consider a native shell only if required capabilities fail the browser test. Create no desktop folder until the decision is accepted.

## Proposed direction

PWA: smallest deployment/update burden. Tauri: native access with smaller shell, but plugin/runtime maintenance. Electron: broad ecosystem and larger runtime/update surface. None selected.

## Alternatives

Desktop expands supported platform and release surface. Offline media storage raises copyright, privacy, and data-protection risks. MIDI/audio and multi-monitor need real hardware tests.

## Consequences and scope limits

No new package or app in this proposal. Verify license/security support of any shell only after owner selects it.

## Dependencies and licensing

https://developer.mozilla.org/en-US/docs/Web/API/Screen_Detailed_Information_API; https://tauri.app/; https://www.electronjs.org/docs/latest; ../RECOMMENDATIONS-VERIFICATION.md#r6--desktop

## References

undefined


