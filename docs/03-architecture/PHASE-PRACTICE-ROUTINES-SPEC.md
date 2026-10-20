# Group-shared Practice warm-up routines — proposal

**Status:** **PROPOSED** — owner-selected product direction dated 2026-10-19; implementation is not authorized until ADR-0095 is accepted and an implementation ticket becomes active under the repository phase gate.
**Decision:** [`ADR-0095`](DECISIONS.md#adr-0095--group-shared-practice-warm-up-routines)
**Research:** [Practice warm-up research](../../.scratch/PRACTICE-WARMUP-RESEARCH-2026-10-19.md)

## Goal

Let a Group director create a short warm-up, share it with the Group, and present its current step on the Practice stage display. Keep the experience focused: a routine builder should feel like arranging a short sequence of rehearsal steps, not editing a score or building a full digital audio workstation.

## Owner-selected product choices

| Area | Choice |
| --- | --- |
| Audience | Voice and instrument warm-ups |
| Routine visibility | Shared with the whole Group |
| Editing | Group Owner and members assigned a dedicated permission |
| Spoken cues | Local, pre-recorded feminine-sounding voice clips; no voice upload or runtime TTS |
| Languages | Spanish, English, and Portuguese |
| Stage | Read-only second-screen warm-up display |

## Proposed scope

### Member experience

- List available Group routines in Practice, with a compact type label, approximate duration, and a one-line purpose.
- Start a routine in the existing Practice warm-up player; show one current step, a restrained progress indicator, and the existing stop/pause controls.
- Play an optional licensed spoken cue locally. Text remains visible and useful when audio is muted, missing, or unavailable.
- Open the existing same-browser stage window for a large, high-contrast current-step view. The main window remains the controller.
- Preserve the current bundled piano guide, comfortable range choices, metronome, and no-microphone behavior.

### Director's routine builder

- Create a routine from a built-in voice or instrument starter, or start with a blank routine.
- Name it, choose voice/instrument, add short instructions, and arrange a small number of steps.
- Use predefined exercise blocks: spoken/text cue, piano pattern/chord cue, metronome exercise, rest, or a link/attachment to a Group practice material.
- Set only relevant block controls, such as comfortable starting range, key/pattern, tempo, repetition count, or duration. Do not add broad MIDI authoring or arbitrary note sequencing in this phase.
- Reorder, preview, save, duplicate, and delete a routine. Warn before leaving with unsaved changes.
- Let the Owner grant routine management through the existing custom-role system using a new `practice.routine.manage` capability. The Owner always has the capability; assigning it does not automatically make that member an Owner or grant other management rights.
- Make saved routines readable/runnable by every active Group member. The management capability controls writes only.

### Practice attachments

- Support the existing allowed document, image, audio, and text formats for Group routine attachments, subject to the established 5 MiB per-file cap and upload safeguards.
- Preserve private, authenticated access and Group-level authorization. No public blob URL, cross-Group resource reference, or cap increase.
- The implementation ticket must decide whether the attachment is an entity owned by the routine or a narrowly extended Resource. It must document deletion, blob cleanup/non-cleanup, download authorization, and how an editor previews the attachment before accepting implementation.
- Reuse the existing storage abstraction and configured provider. Do not add a new storage vendor or client-side direct upload path.

### Spoken cue assets

- Ship short, separately authored cues with es/en/pt text/audio pairs. Every audio file must have a creator/source, exact license or commercial-rights evidence, generation/recording date, and hash in a source manifest.
- Keep playback local after app delivery; no text or voice is sent to a provider during rehearsal.
- ElevenLabs Voice Design/TTS is a candidate for producing a natural feminine-sounding synthetic voice. Its official documentation states that paid subscriptions grant commercial-use rights to generated output; generation must happen under a paid plan if selected. This is a candidate only, not a chosen provider or spending authorization.
- Any recorded human voice requires a signed or otherwise documented grant for commercial app distribution and the intended languages/edits. No user's personal voice is collected or cloned in this phase.

## Proposed domain and access rules

- A routine belongs to exactly one Group. Its ordered steps and routine-owned attachments cannot be referenced from another Group.
- Routine reads and execution require authenticated active Group membership. Write actions require either the Group Owner or `practice.routine.manage`; authorization is checked on every API request and does not trust the Group ID sent by the client.
- The new capability is assignable through Owner-controlled custom roles and is independent of the existing `practice` capability. An Owner retains management access even if role profiles change.
- A Group routine is not an Arrangement, song, setlist, Event plan, or Event snapshot. It does not change those concepts or their authorization.
- Routine media uses the current file size cap and MIME allowlist. An implementation must not create a publicly readable object or bypass item/group membership checks.

## Stage-mode contract

- The controller chooses the routine, controls playback, and owns all step navigation.
- The second window reads the routine via its normal authenticated Group API path and displays the current step. It is a presentation, not a second controller.
- Any BroadcastChannel payload is schema-validated and limited to session/routine identity, current step index, and presentation options. It carries no audio, lyric body, user audio, or playback clock.
- If the window/API/channel is unavailable, the controller remains fully usable and explains how to reopen the display.
- No multi-device synchronization, audio streaming, room presence, or realtime fanout is included.

## Accessibility and visual constraints

- Follow current Practice visual tokens, typography, cards, and controls. Keep routine choice, start, progress, and stop as the primary hierarchy.
- Progressive disclosure: show common steps first; put detailed options inside an individual block. Do not place all controls, warnings, voice settings, and resource metadata on the player screen.
- Keyboard-accessible reordering and playback controls; visible focus and reduced-motion behavior. Stage text must remain readable at distance and not depend on color alone.
- Localize every visible string through `t()` in es/en/pt. Voice playback has an adjacent text equivalent and a mute control.
- No gendered range assumptions; use comfortable lower/middle/higher starting range options where relevant.

## Out of scope

Per-note scoring · microphone input · user voice recording/cloning · real-time TTS · karaoke scoring · pitch detection · AI/cloud LLM · auto-generated musical advice · multi-device audio synchronization · public share links · unrestricted MIDI/sequencer editing · files over 5 MiB · new storage provider · mobile CRUD/editor in this phase.

## Proposed delivery tickets

All tickets below remain **PROPOSED / NOT ACTIVE** until ADR-0095 is accepted and the current repository phase gate permits the Practice work. Do not change `.scratch/NOW.md`'s active ticket to these items by drafting this proposal.

| ID | Work | Gate |
| --- | --- | --- |
| **T-PW-01** | Finalize the domain/persistence design for Group-owned routines and attachments, deletion semantics, concurrency, limits, and migration; add the `practice.routine.manage` capability to server and localized role UI. | ADR acceptance; current active ticket gate cleared; design review |
| **T-PW-02** | Add Group-authorized routine list/detail/create/edit/delete and attachment operations using existing identity, CSRF, upload caps, storage controls, and file authorization. | T-PW-01 design and API validation/security review |
| **T-PW-03** | Build a restrained localized routine editor with starter templates, step blocks, preview, keyboard reorder, unsaved-change handling, and permission-aware entry points. | T-PW-02 contracts |
| **T-PW-04** | Integrate saved routines with the warm-up player and Stage display; bundle only documented licensed es/en/pt voice clips and preserve text-only operation. | T-PW-02 contracts; voice source/license approval; T-PW-03 data model |
| **T-PW-05** | Verify Owner/member/custom-role authorization, cross-Group isolation, upload restrictions, localized editor/player states, accessibility, and controller/stage fallback. | T-PW-01–04 implementation |

## Acceptance criteria for a future implementation

- A member with the management permission can create and edit a routine; a viewer/member without it can see and run one but cannot mutate it; a nonmember and a different Group cannot read or mutate it.
- The Owner always manages routines, including when Owner-only capabilities are excluded from assignable role profiles.
- Routine attachments retain the 5 MiB cap and private authenticated delivery. Malformed, oversized, unsupported, or cross-Group requests fail safely.
- Controller and stage agree on the selected routine and current step without transmitting audio or lyrics over the channel. The controller still works if stage mode is closed.
- Voice assets have an auditable per-file license manifest; the experience remains complete with voice muted or unavailable.
- All visible copy and media labels are localized in es/en/pt and the editor/player pass the app's accessibility review.
