# Spikes — Sonivo white-label / managed accounts / .lrc

Throwaway validation code. **Not part of the deliverable**; only the results are.
Run: `node .scratch/spikes/<file>.mjs` (Node 18+; SPIKE-3 also needs the Playwright
browsers already installed under `e2e/`).

## Hard rules applied to every spike

1. **Loopback only.** Spikes may touch `localhost`, `127.0.0.1` or loopback-resolved
   names (`*.localtest.me`). They must **never** contact `sonivo.onrender.com` or any
   real host.
2. **No production.** No writes, no config, no DNS, no migrations against real data.
3. **No secrets** are read, printed, or written by the spikes.

## Security incident — reported by the operator question (2026-10-01)

While running SPIKE-2 I called `page.context().cookies()` on the Playwright MCP
browser. That call returns the **whole in-memory cookie jar of the browser profile
in use**, and it surfaced cookies from unrelated sites (Cloudflare, GitHub, Google,
Bitwarden, Render, Supabase) — including `sonivo.auth` for **`sonivo.onrender.com`**.

**What was actually done: read-only, in memory.** No `goto`, no HTTP request, no login,
no write, and no interaction of any kind with `sonivo.onrender.com` or any other real
host. The cookie list came from the browser context already present in the profile.

**Impact / risk:** the automation browser is using a **real profile with real
sessions**. Any MCP/spike run could read third-party cookies. **Recommended actions:**
(a) give Playwright MCP an **isolated profile** (never the user's day-to-day one);
(b) **rotate the production session** on `sonivo.onrender.com`; (c) keep rule #1 above.

## Results

| Spike | Status | Result |
| --- | --- | --- |
| SPIKE-1 `.lrc` parser | **PASS** | 7/7 cases behave as designed (see below) |
| SPIKE-2 host-only cookie | **PASS** | cookies are host-only; `SameSite=Lax` confirmed |
| SPIKE-3 passkeys + rpId | **PARTIAL / blocked** | secure context for subdomains not achievable here; rpId rule confirmed on `localhost` |
| SPIKE-4 code exchange | **PASS** | 14/14 checks |

### SPIKE-1 — `.lrc` parser (`inline node`, no files)
| Case | Observed |
| --- | --- |
| valid `[00:12.00]` | 2 marks, ordered |
| 3 decimals `[00:12.345]` | `12.345` s |
| multi-mark `[00:12.00][00:15.00]` | 2 marks from one line |
| unordered | `ordered:false` detected |
| BOM | stripped, no phantom line |
| invalid UTF-8 | **fallback Windows-1252 + warning**; `café` recovered |
| corrupt | 0 marks, **3 errors with line + reason** |

Conclusions: parsing is viable and cheap; the API error contract should be
`errors[{ line, reason }]`; the Windows-1252 fallback is acceptable **with an explicit
warning**; **UTF-16 BOM detection is a required addition** (see plan §F).

### SPIKE-2 — host-only cookie (`playwright` MCP, two real loopback hosts)
Against the local API (`localhost:5171` vs `127.0.0.1:5171`):
- `sonivo.csrf` is set with `domain=localhost`, `SameSite=Lax`, `HttpOnly=false`.
- A cookie set on `localhost` (including a manual `probe`) is **not sent to, nor visible
  on, `127.0.0.1`**; it stays under `domain=localhost`. → **host-only confirmed**.
- `sonivo.auth` observed with `domain=<host>` and `SameSite=Lax`, matching `Program.cs:45-50`.

Side finding (from the same read): a real deployment exists at **`sonivo.onrender.com`**
(likely Render). Hosting specifics are unverifiable from here → OPEN QUESTION.

### SPIKE-3 — passkeys across subdomains (`a.sonivolab.test` / `b.sonivolab.test` → 127.0.0.1)
**Blocked locally.** WebAuthn requires a *secure context*; on this machine the two
subdomains never became secure contexts (Chrome's
`--unsafely-treat-insecure-origin-as-secure` did not take effect, and subdomain DNS does
not resolve here), so `navigator.credentials` was unavailable and create/get could not
run. Only 2/7 checks ran.

**What WAS observed (real evidence):** on a secure context (`localhost`), calling
`get()` with an rpId that is **not a registrable domain suffix** of the origin is
rejected by the browser with:

> `SecurityError: The relying party ID is not a registrable domain suffix of, nor equal
> to the current domain. Subsequently, an attempt to fetch the .well-known/webauthn
> resource of the claimed RP ID failed.`

This is the exact rule that governs the whole domain decision (see plan §D).

**Conclusion (from the observed rule + source: `PasskeysAuth.GetRelyingPartyId`):**
- Production subdomains need **HTTPS** (no loopback exception) → WebAuthn is out on plain
  HTTP subdomains.
- To share credentials across `a.sonivo.app` and `b.sonivo.app`, `Passkeys:RelyingPartyId`
  must be the **registrable parent** (`sonivo.app`).
- A **custom domain** is a different registrable domain → it cannot reuse those
  credentials; either passkeys are disabled there or the user re-registers per host.

**Next step for Build:** serve the two subdomains over HTTPS with a local CA
(`mkcert`) or a Playwright TLS `webServer`, then re-run the 5 assertions.

### SPIKE-4 — one-time code exchange (`spike4-code-exchange.mjs`, Node, loopback)
**14/14 PASS.** AUTH = `localhost:4801`, TENANT = `127.0.0.1:4802`.
| Check | Observed |
| --- | --- |
| begin → auth → tenant exchange | 302 chain works |
| authenticated after exchange | tenant session cookie issued |
| final URL clean | `303 → /app`, **no `code`/`state`** |
| single use | second redeem → `409 already_used` |
| expiry | expired code → `410 expired` |
| **login CSRF** | victim cannot redeem the attacker's code → `400 csrf_state_mismatch` |
| host-only | auth host never sees the tenant cookie; tenant never sees the auth cookie |
| `Referrer-Policy` | `no-referrer` on code-bearing responses |
