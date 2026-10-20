# Practice word-timed lyrics — open-source research

**Date:** 2026-10-19
**Scope:** Public Apple Music documentation and public GitHub projects relevant to word/syllable-level lyrics, focus animation, and timed instrumental breaks.
**Classification:** Research and implementation recommendation; this document does not authorize an implementation, dependency, or license exception.

## Findings

### Apple Music Sing

- **FACT — the visible interaction is timed lyric highlighting.** Apple documents real-time lyrics, vocals adjustment, independently animated background vocals, and a duet layout. Its Apple TV support page describes word-by-word timed lyrics; the original Sing announcement describes every syllable as synchronized with the music. Availability depends on the track and supported device. [Apple Music Sing announcement](https://www.apple.com/newsroom/2022/12/apple-introduces-apple-music-sing/) · [Apple TV lyric and Sing support](https://support.apple.com/en-us/105015)
- **FACT — Apple does not publish the internal rendering or alignment algorithm.** Public docs describe the product behavior. MusicKit's public `Song` model exposes `hasLyrics`, a Boolean, and the Apple Music API song attributes describe that lyrics are available; these are not a public timed-lyrics feed for a third-party renderer. [MusicKit `Song.hasLyrics`](https://developer.apple.com/documentation/musickit/song/haslyrics) · [Apple Music API song attributes](https://developer.apple.com/documentation/applemusicapi/songs/attributes-data.dictionary)
- **FACT — this research found no Apple feature contract for arbitrary user-added instrumental-region markers.** Sonivo should represent a break as an explicit, owner-authored timed section in its own arrangement data; a blank interval between words alone cannot tell whether the passage is an instrumental, a held vocal, or a pause.

### GitHub projects reviewed

| Project | What it demonstrates | License / fit |
| --- | --- | --- |
| [AMLL — applemusic-like-lyrics](https://github.com/amll-dev/applemusic-like-lyrics) | React/Vue lyric renderer styled after Apple Music; word/syllable timing; TTML support; dedicated renderer and parser packages. Its documentation defines word timing and describes a player component that consumes timed lyric lines. [Overview](https://github.com/amll-dev/applemusic-like-lyrics/blob/main/packages/docs/src/content/docs/en/guides/overview/intro.md) · [Quick start](https://github.com/amll-dev/applemusic-like-lyrics/blob/main/packages/docs/src/content/docs/en/guides/component/quickstart.mdx) | **AGPL-3.0-only.** Closest visual/technical reference, but avoid adding or copying it into Sonivo without an explicit legal review and license decision. It also brings graphics/animation peer dependencies, including Pixi components and filters. [License and project docs](https://github.com/amll-dev/applemusic-like-lyrics) |
| [404Lyrics](https://github.com/Chrisss666/404Lyrics) | Strong interaction reference: completed words brighten, the current word fills progressively, upcoming words stay muted; seeking and pause update the active word; missing word timing falls back to line timing. [Karaoke behavior](https://github.com/Chrisss666/404Lyrics) | **GPL-3.0.** Spotify/Spicetify-specific and retrieves word timing from a third-party lyric source. Good behavioral reference only; do not import code or lyrics. [Repository license](https://github.com/Chrisss666/404Lyrics/blob/main/LICENSE) |
| [lrc-audio-player](https://github.com/HangerThem/lrc-audio-player) | Small React hook for syncing timed lyrics to an HTML audio element; MIT licensed. It is a useful example for keeping seek/pause/time state tied to the audio element. [React usage](https://github.com/HangerThem/lrc-audio-player) | **MIT**, but does not provide the immersive Apple-like visual system, a routine editor, or Sonivo's data model. Evaluate only if a focused parser/player helper is still needed; current code already owns the timing/player integration. [License](https://github.com/HangerThem/lrc-audio-player/blob/main/LICENSE) |
| [NeonStageKaraoke](https://github.com/bmachuletz/NeonStageKaraoke) | Mature end-to-end example of manual word/syllable alignment, editor review, stage rendering, and audio-clock timing. [Stage and editor](https://github.com/bmachuletz/NeonStageKaraoke) | **Apache-2.0**, but a full Unity/Avalonia/.NET karaoke platform with stems, import pipelines, and scoring. Too broad and unlike Sonivo's React Stage. Use its workflow concepts only. [License](https://github.com/bmachuletz/NeonStageKaraoke/blob/main/LICENSE) |
| [Karaoke Stage](https://github.com/retroverse-studios/karaoke-stage) | React/TypeScript web player that handles CDG, LRC, and Enhanced LRC word timing. | **MIT**, but the repo also includes optional mic pitch scoring and a general karaoke library UX that Sonivo does not need. [Project and license](https://github.com/retroverse-studios/karaoke-stage) |

## Recommendation for Sonivo

Implement the renderer natively in the existing React Stage rather than adopting the Apple-like AGPL project. Reuse Sonivo's local audio clock, chord/lyric source, Stage Mode window, brand tokens, and authorization. The UI behavior can be inspired by common karaoke conventions without copying Apple assets, exact screens, brand colors, or source code.

### Data and authoring

- The current `ChordTimingJson` is a list of `{ lineIndex, atMs }` marks. It can identify a current line, but cannot identify a word, align a held syllable, or distinguish an instrumental break from a quiet gap. The current phase explicitly says not to imply word-level timing when these marks are absent.
- A future versioned timing format should hold author-entered word or syllable intervals and explicit instrumental intervals, each with `startMs` and `endMs` against the Arrangement's uploaded audio. Preserve existing line marks and read them as a fallback; do not fabricate word timings from line timing or BPM.
- Keep the initial editor manual and tied to the existing uploaded Arrangement audio: play, tap/keyboard-mark the start and end of each word or instrumental section, preview, nudge timing, and save. Automatic speech recognition, lyrics fetching, audio analysis, and external lyric databases stay out.
- An instrumental passage should be a real interval `{ type: instrumental, startMs, endMs }` in the timing document. During it, the stage can show a restrained “Instrumental”/“Interludio” label, keep the next line faintly visible, and continue the song clock; silence or a skipped line should not be mistaken for a marked instrumental.
- Only use lyrics the Group provides or has a right to use. Do not fetch/copy Apple Music, NetEase, Spotify, or community database lyric text into Group arrangements. Open source code licenses do not grant rights to the lyrics/audio included by a separate database or provider.

### Stage presentation

- Center the active lyric line and word. Let completed words settle into the Group's primary color; animate the current word's fill in time; keep upcoming words muted.
- Scale the active line slightly and use a restrained brand-colored glow. Nearby lines can dim and receive a very light blur so the singer can focus; preserve enough contrast to keep their text readable and avoid making blur the only distinction.
- Maintain a low-noise background from the Group's existing colors. Keep player chrome out of the second-screen display; retain controls in the main window.
- During instrumental intervals, replace the active lyric with a small section label and a calm progress cue. Avoid extra panels, score widgets, pitch indicators, confetti, and synchronized multi-device controls.
- Respect `prefers-reduced-motion`; use opacity/position changes without scale/blur motion when reduced motion is requested. Keep contrast, keyboard control in the editor, and a non-animated lyric fallback.

## Sonivo scope and gate

`PHASE-PLAY-SYNC-SPEC.md` and ADR-0031 originally authorized highlighting the current line or block only. The owner explicitly approved a superseding scope on 2026-10-19; ADR-0096 and T-SYNC-06 now authorize manual word timing and explicit instrumental intervals. ADR-0050 remains unchanged: Enhanced LRC word timing stays lossy in v1. Karaoke scoring remains OUT under ADR-0037. The approval does not extend to importing an AGPL/GPL library, lyric data set, or paid service.

## Source verification date

Links above point to official Apple documentation or each project's public GitHub repository, README/docs, and license as reviewed on 2026-10-19. Recheck the repository license and dependency tree before adopting any package; default branches and package dependency requirements can change.
