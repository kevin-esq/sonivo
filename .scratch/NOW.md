# NOW - agent focus

**Updated:** 2026-10-06

## Checkpoint state

```text
Implementation: COMPLETE (slice 1) - Groups UI refactor (ADR-0074)
  Branch: feature/group-ui-refactor (from develop 591799b)
  Delivered:
    - groups/ui/ kit: GroupPageHeader/Breadcrumb, GroupSection, GroupCard, GroupStat,
      GroupChip, GroupIconWell/Button, GroupButton/GroupLink, GroupField/Input/TextArea,
      GroupSelect (custom ARIA combobox), GroupDialog (theme-aware overlay modal with
      focus trap), GroupEmpty/Error/List/Page states, useGroupDataSignal (live data bus).
    - groups/dialogs/: CreateSongDialog, CreateSetlistDialog, CreateEventDialog,
      CreateTaskDialog, CreateResourceDialog (all via GroupDialog).
    - Migrated every group-shell page: GroupHome, GroupResources, GroupRoles,
      GroupCalendar, GroupTasks, Library, Setlists, Events, People (net -~530 LOC).
    - shell/groupEvents.ts: dependency-free real-time bus (same-tab + cross-tab).
    - E2E helpers drive the custom GroupSelect; create helpers hardened with a bounded
      retry (dev-mode route-transition race).
    - reactStrictMode disabled in next.config.ts (dev-only double-mount raced the create
      modals; production never double-invokes effects).
  Verification: tsc clean (only pre-existing main.tsx TS5097); next build green;
    Playwright E2E 88 passed / 3 skipped / 0 failed on the live stack.
  Awaiting: commit/push/PR/merge (authorized: "haz todo ... deja todo versionado y mergeado").
Follow-ups (user chose "todo") - NOT STARTED:
    - Limit notices 80%/100% on create screens.
    - Organization model (ADR-0072).
    - Payments abstraction + Sandbox provider (ADR-0073 §9.13; user chose abstraction+sandbox).
Human approval: APPROVED
Git checkpoint: PENDING
Remote: NOT PUSHED
CI: NOT RUN
```

### Notes
- Active frontend is `web/apps/app/src` (Next shell, ADR-0067).
- `/grupos` (GroupsPage) is account/panel chrome (ADR-0074 §2), so it stays on Sonivo-fixed
  `ui/` components, not the group kit.
- Unrelated untracked files remain: .vscode/, .turbo/, .scratch/shots/, .scratch/security-sweep-*.
