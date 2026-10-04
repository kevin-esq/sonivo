# NOW — agent focus

**Updated:** 2026-10-03

## Checkpoint state

```text
Implementation: COMPLETE — Kanban full redesign (Fases 1-6)
  Backend: in_progress + clean error (commit a49c4bf)
  Frontend F2-3: client state, keyboard, dialogs (commit d472cb0)
  Frontend F4: @dnd-kit drag-and-drop (commit c56ef0a)
  Frontend F5: toolbar, skeleton, i18n (commit b25df05)
  Frontend F6: 30s polling real-time (commit 807c866)
Human approval: APPROVED (user 2026-10-03: "Apruebo todo")
Git checkpoint: COMMITTED — feature/kanban-full-redesign at 807c866
Remote: PUSHED — PR #203 created
CI: NOT RUN (pending PR merge)
```

**Phase:** Kanban full redesign · **ADR-0060/0061/0062** ACCEPTED (user-authorized 2026-10-03)

### Delivered this session
- **ADR-0060**: `in_progress` state in backend + clean validation error message
- **ADR-0061**: `@dnd-kit` drag-and-drop with DragOverlay, keyboard, touch, auto-scroll
- **ADR-0062**: 30s polling for shared real-time updates
- **Fase 2**: Fixed `changeStatus` — apply server response, queue per task, revert only failed task
- **Fase 3**: Fixed keyboard nav, `hasChanges`, Esc, move buttons, `aria-describedby`, `ConfirmDialog`, `ProblemAlert` auto-close
- **Fase 4**: Replaced native HTML5 drag with `@dnd-kit` — `DndContext`, `DragOverlay`, `useDraggable`, `useDroppable`, `PointerSensor` (6px), `TouchSensor` (200ms + vibrate), `KeyboardSensor`
- **Fase 5**: Toolbar `aria-pressed`, skeleton loading, i18n `movedTo`
- **Fase 6**: 30s polling for shared real-time updates

### Remaining (not started — future work)
- WL v4 (color wheel/palette, live preview, banner/group-name editing)
- Setlist generator / Service sheets
- RSVP + Musician call sheet
- Multitrack mini mixer
- Task-to-event/arrangement/song links (backend + UI)
- Manual ordering within column (fractional ranking)
- Notifications (assignment, due-date reminders)
- Task templates per event type
- "My tasks" cross-group view
- Checklist inside card

### Operational notes (local E2E runner)
- Serve the E2E SPA with `npm run preview` (static `dist/`), **not** `npm run dev`; run `npm run build` first.
- API: `dotnet run --project src/Sonivo.Api --launch-profile http` with `$env:Auth__EnableTestHook="true"` on `:5171`; PostgreSQL on `:5433`. Apply new migrations with `$env:SONIVO_MIGRATE_ON_START="true"`.
- CI browses via `http://localhost:5173` (WebAuthn trustworthy origin) — keep when changing E2E.
