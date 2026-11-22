# Domain, tenant subdomains, and session cookies

**Status:** PROPOSED — not accepted. GroupSlug reserves product/system hosts. Production session cookie is host-only with Domain omitted and __Host prefix; SessionHandoff provides cross-host sign-in. Vercel requires nameserver-based DNS for wildcard certificate issuance.

## Context

Kevin must approve current vs target host map, whether wildcard DNS can use Vercel nameservers, tenant subdomain exposure, and the cutover order. Existing ADR-0067/0089 and host-only cookie constraints remain binding.

## Owner decision required

Preserve host-only cookies and one-time SessionHandoff. Treat a tenant host slug only as a selector, never authorization. Test the exact hosts and security boundaries before any DNS migration.

## Proposed direction

Keep current apex/Render/Next bridge longer; use path tenancy where wildcard certificate/DNS ownership is not acceptable. A separate identity app is not required by this proposal.

## Alternatives

Wildcard DNS is a provider control; broad Domain cookies increase cross-subdomain attack surface. Host transitions affect CSRF, OAuth, passkeys, CSP/CORS, redirects, cookies, SEO and availability.

## Consequences and scope limits

No package. Vercel wildcard domain requirement is documented by provider. Never set Domain=.sonivo.lat without a new explicit security decision.

## Dependencies and licensing

https://vercel.com/docs/domains/working-with-domains; https://vercel.com/docs/domains/troubleshooting; ../RECOMMENDATIONS-VERIFICATION.md#r1--domains-and-subdomains

## References

undefined


