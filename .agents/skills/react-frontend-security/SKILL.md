---
name: react-frontend-security
description: >
  Hardens and audits Sonivo's Next.js App Router + React 19 + TypeScript + Tailwind frontend
  against XSS, unsafe HTML, environment-variable leakage, token storage, and
  client-side-only authorization.
  USE FOR: writing or reviewing React components, hooks, data fetching, forms,
  routing, and frontend build/config; security review of a frontend change.
  DO NOT USE FOR: visual/UX design work (use impeccable), backend endpoint or
  EF Core security (use dotnet-secure-architecture), or general refactors.
---

# React Frontend Security (Sonivo)

Security-first rules for the Sonivo frontend: **Next.js App Router, React 19,
TypeScript, Tailwind CSS 4** in the `web/` Turborepo. The frontend is untrusted
by definition; every secret and every authorization decision lives on the API.

## When to Use

- Adding or changing components, hooks, forms, routes, or data fetching.
- Handling user- or API-provided content that is rendered as HTML.
- Configuring Next.js environment variables, rewrites, or build output.
- Performing a security pass over a frontend diff or PR.

## Non-Negotiable Invariants

1. **No secret reaches the browser.** Next.js exposes variables prefixed with
   `NEXT_PUBLIC_` to browser bundles at build time. Treat them as public, frozen
   build configuration. Never put secrets there. Non-prefixed variables are
   server-only unless code explicitly serializes or otherwise exposes them.
2. **The client is never an authorization boundary.** Group membership, roles,
   and tenant scoping are enforced by the API. Hiding UI is UX, not security.
3. **Auth is the Identity cookie + antiforgery** (ADR-0020). Do not store tokens
   in `localStorage`/`sessionStorage`; do not invent a client JWT scheme.
4. **Treat every rendered value as untrusted**, including data from your own API.

## Workflow

### 1. Keep secrets out of the bundle

- Only use `process.env.NEXT_PUBLIC_*` for values intentionally exposed to the
  browser. Never place API keys, tokens, connection strings, or signing secrets
  behind that prefix. Next.js `next.config` `env` values are also bundled; do not
  use that option for secrets.
- Keep private variables in server-only code. Do not pass secrets through Client
  Component props, rendered HTML, API responses, or other serialized output.
- Audit new env usage: sensitive values belong on the API, not browser code.
- Never commit `.env*` with real values.

### 2. Avoid XSS / unsafe HTML

- **Do not** use `dangerouslySetInnerHTML` unless the input is sanitized with a
  vetted sanitizer (e.g. DOMPurify) and the need is justified. Prefer rendering
  text/JSX.
- Do not inject user input into `href`/`src`/`style` without validation; block
  `javascript:` URLs and validate allowed schemes.
- Escape interpolated values; never build HTML strings and inject them.

```tsx
// GOOD — React escapes text
return <span>{user.displayName}</span>;

// BAD — raw, unsanitized HTML
return <div dangerouslySetInnerHTML={{ __html: user.bio }} />;
```

### 3. Auth, CSRF, and requests

- Send requests with credentials so the Identity cookie is included; attach the
  antiforgery token to state-changing requests per ADR-0020.
- Do not roll your own auth headers or persist tokens in web storage.
- On 401/403, redirect to sign-in rather than silently retrying with elevated
  assumptions.

### 4. Validate on the boundary (defense in depth)

- Validate forms client-side for UX **and** rely on server validation for
  correctness; never assume client checks guarantee data integrity.
- Do not send fields the server does not expect (overposting); build explicit
  payloads.

### 5. Safe links, embeds, and content

- Use `rel="noopener noreferrer"` with `target="_blank"`.
- Avoid embedding untrusted remote content; if required, sandbox iframes and set
  a restrictive `CSP`/`sandbox`.
- Do not enable `eval`-like patterns or dynamic `Function` construction.

### 6. Supply chain

- Prefer existing dependencies; adding a package needs justification.
- Run `npm audit` and keep lockfiles consistent; do not commit unrelated
  dependency churn.

## Checklist

- [ ] No secrets or `NEXT_PUBLIC_`-prefixed sensitive values in the client
- [ ] `dangerouslySetInnerHTML` avoided, or sanitized with a vetted sanitizer
- [ ] No HTML string building from untrusted input
- [ ] Cookies + antiforgery used (ADR-0020); no tokens in web storage
- [ ] Client-side role/group checks never treated as authorization
- [ ] External links use `rel="noopener noreferrer"`
- [ ] Form payloads are explicit (no overposting)
- [ ] New dependencies justified; `npm audit` clean

## Common Pitfalls

| Pitfall | Solution |
| ------- | -------- |
| `NEXT_PUBLIC_API_SECRET` used in browser code | Secrets live on the API; `NEXT_PUBLIC_*` values are public and embedded at build time. |
| `dangerouslySetInnerHTML` for rich text | Sanitize with a vetted sanitizer or render as text. |
| Gating admin UI only on the client | Enforce on the server; treat the client check as UX. |
| Storing a token in `localStorage` | Use the Identity cookie + antiforgery; never persist tokens in JS storage. |
| `target="_blank"` without `rel` | Add `rel="noopener noreferrer"`. |
| Trusting API data as safe | React escapes text by default; keep it that way. |

## More Info

- OWASP Top 10 (A03 Injection, A07 Auth), OWASP ASVS.
- ADR-0020 (CSRF/antiforgery), `AGENTS.md` (auth/tenancy invariants).
- [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables) and [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components).
- Related skills: `impeccable` (UX), `dotnet-secure-architecture` (API side).
