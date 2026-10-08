## Summary

- Cross-user real time for group data (ADR-0074 §3/§6): members join `/hubs/group`; any change to songs/setlists/events/tasks/resources/members/group is broadcast as `GroupChanged`.
- One EF `SaveChanges` interceptor maps changed entities to `(group, scope)` and notifies through `IGroupNotifier` (SignalR in the API, no-op default elsewhere), so write handlers stay transport-free.

## Scope

- In: `IGroupNotifier`, `GroupHub`, `SignalRGroupNotifier`, `NoopGroupNotifier`, `GroupChangeInterceptor` (+ DI wiring, hub mapping), `useGroupLive` in the group shell, `realtime.spec.ts`.
- Out: multi-instance backplane (single-instance limitation, same as ADR-0036); presence UI.

## Tests run

- [x] `dotnet test Sonivo.slnx` — Domain 181 · Application 222 · Integration 66 · Api 254 (all green)
- [x] Playwright `realtime` + `library` + `w-d-resources` — green (proves cross-user live update)
- [ ] Frontend build — N/A (client hook only; type-check clean)
- PostgreSQL / migrations impact: none

## Security / authorization

- The hub requires the Identity cookie and `JoinGroup` rechecks Membership server-side (never a client-supplied group id).
- The `/negotiate` POST keeps the global CSRF check; `/hubs` origin validation already applies.

## Documentation

- none (ADR-0074 already ACCEPTED)
