# Multi-client API contract and OpenAPI ownership

**Status:** PROPOSED — not accepted. The API uses ASP.NET Core built-in OpenAPI at runtime, while web, Kotlin, and Swift clients maintain hand-written adapters. Microsoft documents named documents and explicit OpenAPI 3.1 selection; current .NET 10 documentation describes 3.2 as the default. The repo has no committed contracts/openapi.json or drift gate.

## Context

Kevin must choose whether the generated API document becomes the canonical artifact, whether to commit generated output or regenerate in CI, and whether to generate any client. Keep current client code and runtime routes until approved.

## Owner decision required

Keep built-in Microsoft.AspNetCore.OpenApi; define a deterministic document export and drift check first. Evaluate per-client generation separately against nullable DTOs, Identity cookies/CSRF for web, OAuth PKCE/bearer for native, error codes, and hand-authored ergonomics.

## Proposed direction

No generator; hand-maintained clients with contract tests. This keeps idiomatic clients but permits drift. A generated client for TS only is another option, but creates two ownership modes.

## Alternatives

Drift check costs CI/runtime maintenance; generation can create noisy diffs and alter serialization assumptions. Exclude health/internal routes and SignalR from generated REST contract unless approved. Never put credentials in artifacts.

## Consequences and scope limits

The .NET runtime generation feature is built-in; no new package is proposed. Any third-party generator needs current license, maintenance, compatibility, and owner review.

## Dependencies and licensing

https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/aspnetcore-openapi?view=aspnetcore-10.0; ../RECOMMENDATIONS-VERIFICATION.md#r4--multi-client-contract

## References

undefined


