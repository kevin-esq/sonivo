# REST API versioning and deprecation policy

**Status:** PROPOSED — not accepted. API routes currently use /api/...; built-in OpenAPI document is /openapi/v1.json, which is a document name, not proof that REST routes are versioned. Web, Android, iOS, and E2E consume existing routes.

## Context

Kevin must select route strategy, aliases, retirement date rule, API contract version versus build version, client rollout guarantees, and whether health/hubs remain unversioned. No public route changes are approved by this draft.

## Owner decision required

Prefer URL path versioning such as /api/v1 for public REST because it is visible, cacheable, and easy to document. Keep temporary old aliases until all known clients migrate; retire only after an owner-approved interval and usage evidence. Keep OpenAPI documents separated by contract version. Keep health and SignalR outside REST versioning unless explicitly decided.

## Proposed direction

Header versioning hides compatibility in request metadata; query versioning has cache and contract clarity costs. Running parallel endpoint sets can duplicate mappings, so use one OpenAPI generator and one UI integration.

## Alternatives

Changing paths breaks mobile binaries and external callers. Alias retirement must account for app-store upgrade lag. Separate API contract version from assembly/build semver.

## Consequences and scope limits

No versioning package is selected. Built-in .NET OpenAPI supports named documents; a UI package is a separate decision and must be license/current-support checked.

## Dependencies and licensing

https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/aspnetcore-openapi?view=aspnetcore-10.0; ../RECOMMENDATIONS-VERIFICATION.md#r4--multi-client-contract

## References

undefined


